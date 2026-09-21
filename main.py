#!/usr/bin/env python3
"""Run the complete Party Spark project from a single command.

Party Spark itself is a TanStack Start (React + Vite) app whose local `/api`
endpoints are served by the Node/SQLite code in `Database/`. This script is the
Python front door: it checks the toolchain, installs dependencies, prepares the
SQLite database, and then starts the server that serves both the SPA and the API.

If the port is already taken the launcher asks what to do — stop the process
holding it, or start on a free port instead — and only then launches the project.
The question is skipped when --on-busy says what to do, and goes unanswered it
falls back to a free port rather than hanging.

Usage:
    python main.py                  # install if needed, prepare the db, start the dev server
    python main.py --reset-db       # rebuild Database/directory.db, then start
    python main.py --port 9000      # run on a specific port
    python main.py --on-busy kill   # stop whatever holds the port, no prompting
    python main.py --open           # open the site in a browser once it is up
    python main.py --mode build     # production build, then exit
    python main.py --mode preview   # serve an existing production build

Only the Python standard library is required (no pip install).
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import signal
import socket
import sqlite3
import subprocess
import sys
import threading
import time
import webbrowser
from collections.abc import Sequence
from pathlib import Path
from typing import NoReturn

ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("DB_PATH") or ROOT / "Database" / "directory.db")
NODE_MODULES = ROOT / "node_modules"

# Vite prints the dev token/site URLs; capture the first http one it reports.
URL_PATTERN = re.compile(r"https?://(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?/?\S*")
ANSI_PATTERN = re.compile(r"\x1b\[[0-9;]*m")

MODES = ("dev", "preview", "build")

# Dev serves on 8080 (the port the scripts/ checks and the Lovable config expect);
# vite preview defaults to 4173. Both are passed explicitly so the port that gets
# checked is always the port that gets bound.
DEFAULT_PORTS = {"dev": 8080, "preview": 4173}
PORT_SCAN_LIMIT = 50
ON_BUSY_CHOICES = ("ask", "kill", "shift", "abort")
PORT_PROMPT_TIMEOUT = 30.0


def log(message: str) -> None:
    print(f"[party-spark] {message}", flush=True)


def configure_console() -> None:
    """Keep Vite's box-drawing glyphs from crashing a non-UTF-8 Windows console."""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is None:
            continue
        try:
            reconfigure(errors="replace")
        except (OSError, ValueError):
            pass


def die(message: str, code: int = 1) -> NoReturn:
    print(f"[party-spark] error: {message}", file=sys.stderr, flush=True)
    raise SystemExit(code)


def which(program: str) -> str:
    """Locate an executable, including the Windows `.cmd` shims used by npm."""
    suffixes = (".cmd", ".exe", ".bat", "") if os.name == "nt" else ("",)
    for suffix in suffixes:
        found = shutil.which(program + suffix)
        if found:
            return found
    return ""


def command(program: str, args: Sequence[str]) -> list[str]:
    """Build an argv that also runs batch shims such as npm.cmd on Windows."""
    executable = which(program) or program
    if os.name == "nt" and executable.lower().endswith((".cmd", ".bat")):
        return [os.environ.get("ComSpec", "cmd.exe"), "/d", "/c", executable, *args]
    return [executable, *args]


def run_step(program: str, args: Sequence[str], description: str) -> None:
    """Run a blocking setup step, streaming its output, and fail loudly."""
    log(description)
    try:
        completed = subprocess.run(command(program, args), cwd=ROOT)
    except OSError as error:
        die(f"could not run {program}: {error}")
    if completed.returncode != 0:
        die(f"{description} failed with exit code {completed.returncode}.")


def check_toolchain() -> None:
    if not which("node"):
        die("Node.js was not found on PATH. Install Node.js 20+ and try again.")
    if not which("npm"):
        die("npm was not found on PATH. Install Node.js (which bundles npm) and try again.")


def ensure_dependencies(skip_install: bool) -> None:
    if NODE_MODULES.is_dir():
        return
    if skip_install:
        die("node_modules is missing and --skip-install was given.")
    run_step("npm", ["install"], "Installing JavaScript dependencies (npm install)...")


def database_ready() -> bool:
    """True when the SQLite directory exists and actually contains listings."""
    if not DB_PATH.exists():
        return False
    try:
        uri = DB_PATH.resolve().as_uri() + "?mode=ro"
        with sqlite3.connect(uri, uri=True, timeout=2) as connection:
            row = connection.execute("SELECT COUNT(*) FROM listings").fetchone()
        return bool(row and row[0] > 0)
    except sqlite3.Error:
        return False


def prepare_database(reset: bool) -> None:
    if not reset and database_ready():
        log(f"Database ready at {DB_PATH}.")
        return

    log("Rebuilding the local SQLite directory (schema + Excel import)...")
    run_step("node", [str(ROOT / "Database" / "reset.js")], "Creating the schema and seed data...")
    run_step(
        "node",
        [str(ROOT / "Database" / "import-excel.cjs")],
        "Importing listings from the Excel workbook...",
    )
    if not database_ready():
        die("database setup finished but no listings were imported.")
    log("Database ready.")


def stop_process(process: subprocess.Popen[str]) -> None:
    if process.poll() is not None:
        return
    try:
        if os.name == "nt":
            process.send_signal(signal.CTRL_BREAK_EVENT)
        else:
            process.send_signal(signal.SIGINT)
        process.wait(timeout=10)
        return
    except (subprocess.TimeoutExpired, OSError, ValueError):
        pass

    if os.name == "nt":
        # npm runs the server through a child process; kill the whole tree.
        subprocess.run(
            ["taskkill", "/pid", str(process.pid), "/T", "/F"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        return

    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()


def port_in_use(host: str, port: int) -> bool:
    """True when the port already accepts connections or cannot be bound."""
    address = host or "127.0.0.1"
    try:
        with socket.create_connection((address, port), timeout=0.5):
            return True
    except OSError:
        pass

    # A bind probe also catches sockets that are reserved but not yet listening.
    # SO_REUSEADDR is deliberately left off: on Windows it would let this probe
    # bind right next to the very process it is supposed to detect.
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        try:
            probe.bind((address, port))
        except OSError:
            return True
    return False


def next_free_port(host: str, start: int) -> int | None:
    for candidate in range(start, start + PORT_SCAN_LIMIT):
        if not port_in_use(host, candidate):
            return candidate
    return None


def listener_pid(port: int) -> int | None:
    """PID of the process listening on the port, when it can be determined."""
    if os.name == "nt":
        try:
            output = subprocess.run(
                ["netstat", "-ano", "-p", "TCP"],
                capture_output=True,
                text=True,
                timeout=20,
            ).stdout
        except (OSError, subprocess.SubprocessError):
            return None
        match = re.search(
            rf"^\s*TCP\s+\S+:{port}\s+\S+\s+LISTENING\s+(\d+)\s*$",
            output,
            re.MULTILINE | re.IGNORECASE,
        )
        return int(match.group(1)) if match else None

    lsof = which("lsof")
    if lsof:
        try:
            output = subprocess.run(
                [lsof, "-ti", f"tcp:{port}", "-sTCP:LISTEN"],
                capture_output=True,
                text=True,
                timeout=15,
            ).stdout
        except (OSError, subprocess.SubprocessError):
            output = ""
        for token in output.split():
            if token.isdigit():
                return int(token)

    ss = which("ss")
    if ss:
        try:
            output = subprocess.run(
                [ss, "-ltnpH", f"sport = :{port}"],
                capture_output=True,
                text=True,
                timeout=15,
            ).stdout
        except (OSError, subprocess.SubprocessError):
            output = ""
        match = re.search(r"pid=(\d+)", output)
        if match:
            return int(match.group(1))
    return None


def describe_process(pid: int) -> str:
    """Label such as 'node.exe (PID 1234)' for the confirmation prompt."""
    name = ""
    if os.name == "nt":
        try:
            output = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
                capture_output=True,
                text=True,
                timeout=20,
            ).stdout.strip()
        except (OSError, subprocess.SubprocessError):
            output = ""
        if output.startswith('"'):
            name = output.split('","')[0].strip('"')
    else:
        try:
            name = subprocess.run(
                ["ps", "-p", str(pid), "-o", "comm="],
                capture_output=True,
                text=True,
                timeout=15,
            ).stdout.strip()
        except (OSError, subprocess.SubprocessError):
            name = ""
    return f"{name} (PID {pid})" if name else f"PID {pid}"


def pid_is_safe_to_kill(pid: int) -> bool:
    """Never aim at the fake system PIDs or at this launcher's own process."""
    if pid <= 4:
        return False
    return pid not in {os.getpid(), os.getppid()}


def stop_listener(pid: int) -> bool:
    """Stop one process; only ever called after the user confirmed it."""
    if os.name != "nt":
        try:
            os.kill(pid, signal.SIGTERM)
            return True
        except OSError as error:
            log(f"Could not stop PID {pid}: {error}")
            return False

    try:
        completed = subprocess.run(
            ["taskkill", "/PID", str(pid), "/T", "/F"],
            capture_output=True,
            text=True,
            timeout=30,
        )
    except (OSError, subprocess.SubprocessError) as error:
        log(f"Could not stop PID {pid}: {error}")
        return False
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout).strip()
        log(f"taskkill refused to stop PID {pid}{f': {detail}' if detail else ''}.")
        return False
    return True


def wait_until_free(host: str, port: int, timeout: float = 10.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if not port_in_use(host, port):
            return True
        time.sleep(0.25)
    return not port_in_use(host, port)


def read_answer(prompt: str, timeout: float) -> str | None:
    """Read one line, or return None when input closed or nobody answered.

    An empty string means the user just pressed Enter (accept the default);
    None means there was no answer at all, so the caller can say so.
    The read runs on a worker thread so an open-but-silent stdin (a pipe that
    never delivers anything) cannot hang the launcher. `isatty` alone is not
    enough to detect that case: on Windows a NUL stdin still reports isatty()
    as True.
    """
    replies: list[str | None] = []

    def read() -> None:
        try:
            replies.append(input(prompt))
        except EOFError:
            replies.append(None)
        except KeyboardInterrupt:
            replies.append("abort")  # Ctrl+C while deciding means "do not start"

    worker = threading.Thread(target=read, daemon=True)
    worker.start()
    worker.join(timeout)
    print(flush=True)  # close the prompt line, answered or not
    if not replies or replies[0] is None:
        return None
    return replies[0]


def prompt_port_choice(port: int, who: str, free_port: int | None, can_kill: bool) -> str:
    """Ask what to do about a taken port; returns 'kill', 'shift' or 'abort'."""
    choices = {
        "1": "kill", "k": "kill", "kill": "kill", "stop": "kill",
        "2": "shift", "n": "shift", "new": "shift", "shift": "shift",
        "3": "abort", "a": "abort", "abort": "abort", "q": "abort",
    }
    default = "2" if free_port else "3"

    log(f"Port {port} is already in use by {who}.")
    print("[party-spark] What would you like to do?", flush=True)
    if can_kill:
        print(f"  1) Stop {who} and use port {port}", flush=True)
    else:
        print("  1) Stop the process and use this port (unavailable: owner unknown)", flush=True)
    print(
        f"  2) Start on the next free port instead ({free_port})"
        if free_port
        else "  2) Start on the next free port instead (none found)",
        flush=True,
    )
    print("  3) Abort", flush=True)

    prompt = f"[party-spark] Choose 1-3 [default: {default}, auto in {int(PORT_PROMPT_TIMEOUT)}s]: "
    deadline = time.monotonic() + PORT_PROMPT_TIMEOUT
    while True:
        remaining = deadline - time.monotonic()
        reply = read_answer(prompt, remaining) if remaining > 0 else None
        if reply is None:
            log(f"No answer received, continuing with option {default}.")
            return choices[default]
        answer = reply.strip().lower()
        if not answer:
            return choices[default]
        if answer in choices:
            return choices[answer]
        print("[party-spark] Please answer 1, 2 or 3.", flush=True)


def resolve_port(host: str, port: int, on_busy: str, interactive: bool) -> tuple[str, int]:
    """Settle on a usable port, returning ('use', port) or ('abort', port).

    `on_busy` is ask/kill/shift/abort. Asking needs a real console, so a piped or
    redirected run shifts to a free port rather than blocking on a prompt that
    nobody can answer.
    """
    if not port_in_use(host, port):
        return ("use", port)

    holder = listener_pid(port)
    who = describe_process(holder) if holder is not None else "an unidentified process"
    free_port = next_free_port(host, port + 1)

    action = on_busy
    if action == "ask":
        if interactive:
            action = prompt_port_choice(port, who, free_port, holder is not None)
        else:
            log(f"Port {port} is busy ({who}); no console to ask on, so a free port is used instead.")
            action = "shift"

    if action == "abort":
        log(f"Port {port} is busy ({who}); not starting anything.")
        return ("abort", port)

    if action == "kill":
        if holder is None:
            log(f"Port {port} is busy but the owner could not be identified; not killing anything.")
            return ("abort", port)
        if not pid_is_safe_to_kill(holder):
            log(f"Refusing to stop {who}: that is a system process or this launcher itself.")
            return ("abort", port)
        log(f"Stopping {who}...")
        if not stop_listener(holder):
            return ("abort", port)
        if not wait_until_free(host, port):
            log(f"Port {port} is still busy after stopping {who}.")
            return ("abort", port)
        log(f"Port {port} is free again.")
        return ("use", port)

    if free_port is None:
        log(f"Port {port} is busy and no free port was found in the next {PORT_SCAN_LIMIT}.")
        return ("abort", port)
    log(f"Using free port {free_port} instead of {port}.")
    return ("use", free_port)


def serve(mode: str, host: str, port: int, open_browser: bool) -> int:
    # The port was already checked, so --strictPort is safe here: if something
    # grabs it in between, Vite fails loudly instead of drifting to another port
    # and leaving the printed URL wrong.
    forwarded: list[str] = ["--port", str(port), "--strictPort"]
    if host:
        forwarded += ["--host", host]

    args = ["run", mode, "--", *forwarded]

    log(f"Starting the {mode} server...")
    creationflags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
    try:
        process = subprocess.Popen(
            command("npm", args),
            cwd=ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
            creationflags=creationflags,
        )
    except OSError as error:
        die(f"could not start the server: {error}")

    announced = False
    try:
        assert process.stdout is not None
        for raw_line in process.stdout:
            line = ANSI_PATTERN.sub("", raw_line).rstrip()
            print(line, flush=True)
            if announced:
                continue
            match = URL_PATTERN.search(line)
            if not match:
                continue
            url = match.group(0).rstrip(".,")
            announced = True
            log(f"Party Spark is running at {url}")
            log("Press Ctrl+C to stop.")
            if open_browser:
                webbrowser.open(url)
    except KeyboardInterrupt:
        log("Stopping...")
    finally:
        stop_process(process)

    if not announced:
        log("Server output ended before a URL was reported; check the log above.")
    return process.returncode or 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="main.py",
        description="Set up and run the complete Party Spark project.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "examples:\n"
            "  python main.py                 start the dev server (default)\n"
            "  python main.py --reset-db      rebuild the database first\n"
            "  python main.py --mode build    create a production build\n"
        ),
    )
    parser.add_argument("--mode", choices=MODES, default="dev", help="what to run (default: dev)")
    parser.add_argument("--host", default="", help="host/interface to bind (default: Vite's)")
    parser.add_argument("--port", type=int, default=0, help="port to listen on (default: 8080 dev, 4173 preview)")
    parser.add_argument(
        "--on-busy",
        choices=ON_BUSY_CHOICES,
        default="ask",
        help="when the port is taken: ask, kill its owner, shift to a free port, or abort (default: ask)",
    )
    parser.add_argument("--reset-db", action="store_true", help="rebuild the SQLite database first")
    parser.add_argument("--skip-install", action="store_true", help="never run npm install")
    parser.add_argument("--skip-db", action="store_true", help="never touch the database")
    parser.add_argument("--open", action="store_true", help="open the site in a browser once ready")
    return parser.parse_args()


def main() -> int:
    configure_console()
    args = parse_args()

    log(f"Project root: {ROOT}")
    check_toolchain()
    ensure_dependencies(args.skip_install)
    if not args.skip_db:
        prepare_database(args.reset_db)

    if args.mode == "build":
        run_step("npm", ["run", "build"], "Building for production...")
        log("Build finished. Output is in .output/public.")
        return 0

    port = args.port or DEFAULT_PORTS[args.mode]
    action, port = resolve_port(args.host, port, args.on_busy, sys.stdin.isatty())
    if action != "use":
        return 1

    return serve(args.mode, args.host, port, args.open)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print()
        sys.exit(130)
