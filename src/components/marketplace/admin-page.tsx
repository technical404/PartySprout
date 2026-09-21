import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertCircle, Building2, CheckCheck, Clock3, ExternalLink, Loader2, Mail, ShieldCheck, Users, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Footer } from "./footer";
import { StatusChip } from "./vendor-pages";
import { LoginPanel } from "./account-pages";
import { api, type OwnedListing } from "@/lib/api";
import type { QuoteRequestRow } from "@/lib/marketplace-data";
import { useSession } from "@/lib/session";

function Stat({ label, value, hint }: { label: string; value: number | undefined; hint?: string }) {
  return <div className="rounded-lg border bg-background p-5">
    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="mt-2 font-display text-3xl font-extrabold">{value ?? "—"}</p>
    {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
  </div>;
}

/**
 * The review queue is the only place a listing can become public, so this page
 * is the gatekeeper: everything here reads and writes real rows.
 */
export function AdminPage() {
  const { user, loading, refresh } = useSession();
  const [tab, setTab] = useState<"pending" | "active" | "rejected">("pending");
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [byStatus, setByStatus] = useState<Array<{ status: string; total: number }>>([]);
  const [queue, setQueue] = useState<OwnedListing[]>([]);
  const [quotes, setQuotes] = useState<QuoteRequestRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    const [summary, submissions, recent] = await Promise.all([
      api.adminStats(),
      api.adminSubmissions(tab),
      api.adminQuotes(),
    ]);
    if (summary.ok) {
      setStats(summary.data.stats ?? null);
      setByStatus(summary.data.byStatus ?? []);
    } else setError(summary.message);
    if (submissions.ok) setQueue(submissions.data.items ?? []);
    if (recent.ok) setQuotes(recent.data.items ?? []);
    setBusy(false);
  }, [tab]);

  useEffect(() => {
    if (!user || user.role !== "admin") return;
    void load();
  }, [user, load]);

  async function review(id: number, status: "active" | "rejected" | "pending") {
    setBusy(true);
    const result = await api.reviewListing(id, status, status === "rejected" ? note : "");
    if (!result.ok) setError(result.message);
    setNote("");
    await load();
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-surface"><p className="text-muted-foreground">Checking your account…</p></main>;

  if (!user || user.role !== "admin") {
    return <main className="min-h-screen bg-surface pb-24">
      <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <p className="font-bold text-primary">Administration</p>
        <h1 className="mt-2 font-display text-4xl font-extrabold">Admin sign-in</h1>
        <p className="mt-4 text-lg leading-8 text-muted-foreground">
          {user
            ? "This account is not an admin, so there is nothing to show here."
            : "Admins review new business submissions. This screen is the only way a listing becomes public."}
        </p>
        {!user && <div className="mt-8"><LoginPanel note="Sign in with an admin account." onDone={() => void refresh()} /></div>}
        {user && <Button className="mt-6" variant="outline" asChild><Link to="/account">Go to my account</Link></Button>}
      </div>
      <Footer />
    </main>;
  }

  const pending = byStatus.find((row) => row.status === "pending")?.total ?? 0;

  return <main className="min-h-screen bg-surface pb-24">
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-primary">Administration</p>
          <h1 className="font-display text-3xl font-extrabold">Review queue</h1>
          <p className="mt-1 text-muted-foreground">
            {pending === 0 ? "Nothing waiting for review." : `${pending} submission${pending === 1 ? "" : "s"} waiting for a decision.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={busy}><Loader2 className={busy ? "animate-spin" : "hidden"} />Refresh</Button>
          <Button variant="outline" asChild><Link to="/search" search={{ q: "", location: "" }}>Open the directory</Link></Button>
        </div>
      </div>

      {error && <p className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>}

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Directory statistics">
        <Stat label="Live listings" value={stats?.["listings"]} hint="Visible in search" />
        <Stat label="Pending" value={stats?.["pending"]} hint="Awaiting a decision" />
        <Stat label="Rejected" value={stats?.["rejected"]} hint="Hidden from search" />
        <Stat label="Quote requests" value={stats?.["quoteRequests"]} hint={`${stats?.["quotesLast7Days"] ?? 0} in the last 7 days`} />
        <Stat label="Accounts" value={stats?.["users"]} />
        <Stat label="Vendor accounts" value={stats?.["vendors"]} />
        <Stat label="Saved businesses" value={stats?.["favorites"]} />
        <Stat label="Categories" value={stats?.["categories"]} />
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-center gap-2">
          {(["pending", "active", "rejected"] as const).map((status) => <button
            key={status}
            type="button"
            onClick={() => setTab(status)}
            className={`rounded-full border px-4 py-2 text-sm font-bold ${tab === status ? "border-primary bg-primary-soft text-primary" : "bg-background text-muted-foreground"}`}
          >
            {status === "pending" ? "Waiting for review" : status === "active" ? "Live" : "Rejected"}
          </button>)}
        </div>

        {queue.length === 0
          ? <p className="mt-5 rounded-lg border bg-background p-6 text-sm text-muted-foreground">
            Nothing in this list right now.
          </p>
          : <ul className="mt-5 space-y-4">
            {queue.map((listing) => <li key={listing.id} className="rounded-2xl border bg-background p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <Building2 className="mt-1 size-5 text-primary" />
                  <div>
                    <h2 className="font-display text-xl font-extrabold">{listing.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      {[listing.category_name, listing.city_name, listing.state_code].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>
                <StatusChip status={listing.status ?? "pending"} />
              </div>

              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div><dt className="text-muted-foreground">Website</dt><dd className="truncate font-semibold">{listing.website ?? "—"}</dd></div>
                <div><dt className="text-muted-foreground">Phone</dt><dd className="font-semibold">{listing.phone ?? "—"}</dd></div>
                <div><dt className="text-muted-foreground">Email</dt><dd className="truncate font-semibold">{listing.email ?? "—"}</dd></div>
                <div><dt className="text-muted-foreground">Starting price</dt><dd className="font-semibold">{listing.price_from ? `$${listing.price_from}` : "Not published"}</dd></div>
              </dl>

              {listing.description && <p className="mt-4 whitespace-pre-line text-sm leading-7 text-muted-foreground">{listing.description}</p>}
              {listing.review_note && <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Previous note: {listing.review_note}</p>}

              <div className="mt-5 flex flex-wrap items-center gap-3">
                {listing.status !== "active" && <Button onClick={() => void review(listing.id, "active")} disabled={busy}><CheckCheck />Approve and publish</Button>}
                {listing.status !== "rejected" && <Button variant="outline" onClick={() => void review(listing.id, "rejected")} disabled={busy}><X />Reject</Button>}
                {listing.status !== "pending" && <Button variant="ghost" onClick={() => void review(listing.id, "pending")} disabled={busy}><Clock3 />Send back to review</Button>}
                {listing.status === "active" && <Button variant="ghost" asChild>
                  <Link to="/vendors/$slug" params={{ slug: listing.slug }}><ExternalLink />View public page</Link>
                </Button>}
              </div>

              {listing.status !== "active" && <label className="mt-4 grid max-w-xl gap-2 text-sm font-semibold">
                Reviewer note (optional, shown to the vendor)
                <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Explain what needs changing" />
              </label>}
            </li>)}
          </ul>}
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl font-extrabold">Recent quote requests</h2>
        <p className="mt-1 text-sm text-muted-foreground">The latest 50 requests in the database, whoever they were sent to.</p>
        {quotes.length === 0
          ? <p className="mt-5 rounded-lg border bg-background p-6 text-sm text-muted-foreground">No quote requests yet.</p>
          : <div className="mt-5 overflow-x-auto rounded-2xl border bg-background">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="p-3 font-bold">Received</th>
                  <th className="p-3 font-bold">Parent</th>
                  <th className="p-3 font-bold">Party</th>
                  <th className="p-3 font-bold">Sent to</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((quote: QuoteRequestRow) => <tr key={quote.id} className="border-b last:border-0">
                  <td className="p-3 whitespace-nowrap">{new Date(quote.created_at).toLocaleDateString()}</td>
                  <td className="p-3">
                    <span className="block font-semibold">{quote.name}</span>
                    <a className="inline-flex items-center gap-1 text-primary" href={`mailto:${quote.email}`}><Mail className="size-3.5" />{quote.email}</a>
                  </td>
                  <td className="p-3">{[quote.city, quote.event_date, quote.budget].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="p-3">{quote.vendor_name ?? "Any matching entertainer"}</td>
                </tr>)}
              </tbody>
            </table>
          </div>}
      </section>

      <section className="mt-10 flex flex-wrap gap-4">
        <Card icon={ShieldCheck} title="What approval does" copy="Approving sets the listing live, so it appears in search and at its own URL. Rejecting keeps it hidden and stores your note for the vendor." />
        <Card icon={Users} title="Who can submit" copy="Any signed-in account can submit a business. Accounts are not pre-approved, so the review queue is the real gate." />
        <Card icon={AlertCircle} title="Test data" copy="Rows created by probes and test accounts are real database rows — delete them in the database if you do not want them." />
      </section>
    </div>
    <Footer />
  </main>;
}

function Card({ icon: Icon, title, copy }: { icon: typeof ShieldCheck; title: string; copy: string }) {
  return <div className="flex-1 rounded-lg border bg-background p-5">
    <Icon className="size-5 text-primary" />
    <h3 className="mt-3 font-display text-base font-extrabold">{title}</h3>
    <p className="mt-1 text-sm text-muted-foreground">{copy}</p>
  </div>;
}
