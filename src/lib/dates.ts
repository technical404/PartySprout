/**
 * The site reads and writes dates as mm-dd-yyyy.
 *
 * A native `<input type="date">` cannot be made to do that: the text it shows and
 * the text it accepts both follow the browser's locale, so a visitor in the US
 * sees mm/dd/yyyy, one in the UK sees dd/mm/yyyy, and no attribute or CSS changes
 * it. Values are still *stored* as ISO (yyyy-mm-dd) everywhere — in the URL, in the
 * wizard's form state, in the database — and only the display and entry are
 * mm-dd-yyyy, through these two functions.
 */

const pad = (value: number) => String(value).padStart(2, "0");

/** ISO (yyyy-mm-dd) for a local calendar day, without the UTC shift `toISOString` adds. */
export function isoFromDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The local day an ISO string names. Always midnight local, never UTC. */
export function dateFromISO(iso: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return undefined;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/**
 * "2026-12-24" -> "12-24-2026". Also takes a database timestamp such as
 * "2026-12-24 14:31:00" (written into MySQL, and what the API returns), reading the
 * day straight off the string so the browser's own date parsing cannot shift it.
 * Anything that is not a date is handed back untouched.
 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const stamped = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/.exec(value);
  if (stamped) return `${stamped[2]}-${stamped[3]}-${stamped[1]}`;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return `${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}-${parsed.getFullYear()}`;
}

/**
 * "12-24-2026" (or 12/24/26, or 12242026) -> "2026-12-24", or null when the text is
 * not a date that exists. A day that cannot exist is rejected rather than rolled
 * forward, so 02-30-2026 never quietly becomes the 2nd of March.
 */
export function parseDate(text: string): string | null {
  const trimmed = text.trim();
  const parts = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(trimmed);
  let month: number, day: number, year: number;
  if (parts) {
    month = Number(parts[1]);
    day = Number(parts[2]);
    year = Number(parts[3]);
    if (year < 100) year += 2000;
  } else if (/^\d{8}$/.test(trimmed)) {
    month = Number(trimmed.slice(0, 2));
    day = Number(trimmed.slice(2, 4));
    year = Number(trimmed.slice(4));
  } else return null;

  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Digits into mm-dd-yyyy as they are typed, so a phone's number pad can write a
 * date and typing "-" is optional. Anything else (a pasted "12/24/2026") is reduced
 * to the same shape, because only the digits carry information.
 */
export function maskDate(text: string): string {
  const digits = text.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
}

/** Today in the visitor's own timezone, for the earliest day a form will accept. */
export function todayISO(): string {
  return isoFromDate(new Date());
}
