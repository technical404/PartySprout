import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertCircle, Check, Heart, Loader2, LogOut, Scale, Send, Sparkles, WandSparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Footer } from "./footer";
import { Rating, VendorCard, VendorLogo } from "./marketplace";
import {
  fetchCategories, fetchCitySuggestions, fetchListings, fetchListingsByIds, fetchMyQuoteRequests,
  type Category, type City, type QuoteRequestRow, type Vendor,
} from "@/lib/marketplace-data";
import { useSaved } from "@/lib/saved";
import { useSession } from "@/lib/session";
import { SUPPORT_EMAIL } from "@/lib/site";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------------- */
/* Accounts                                                                   */
/* ------------------------------------------------------------------------- */

/**
 * Login and sign-up in one panel. Used by /login, and inline wherever a task
 * needs an account (listing a business, opening a vendor dashboard).
 */
export function LoginPanel({ intent = "parent", note, onDone }: {
  intent?: "parent" | "vendor";
  note?: string;
  onDone?: () => void;
}) {
  const { login, signup } = useSession();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [wantsBusiness, setWantsBusiness] = useState(intent === "vendor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});

    const result = mode === "login"
      ? await login(email, password)
      : await signup({ email, name, password, phone, role: wantsBusiness ? "vendor" : "parent" });

    if (!result.ok) {
      setError(result.message);
      setFields(result.fields ?? {});
      setBusy(false);
      return;
    }
    setBusy(false);
    onDone?.();
  }

  return <div className="rounded-2xl border bg-background p-6 shadow-sm sm:p-8">
    <div className="flex gap-2 rounded-lg bg-muted p-1">
      <button type="button" onClick={() => setMode("login")} className={cn("flex-1 rounded-md px-3 py-2 text-sm font-bold", mode === "login" && "bg-background shadow-sm")}>Log in</button>
      <button type="button" onClick={() => setMode("signup")} className={cn("flex-1 rounded-md px-3 py-2 text-sm font-bold", mode === "signup" && "bg-background shadow-sm")}>Create account</button>
    </div>

    {note && <p className="mt-4 text-sm text-muted-foreground">{note}</p>}

    {error && <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
      <AlertCircle className="mt-0.5 size-4 shrink-0" /><p>{error}</p>
    </div>}

    <form onSubmit={submit} className="mt-5 grid gap-4" noValidate>
      {mode === "signup" && <label className="grid gap-2 text-sm font-semibold">
        Your name
        <Input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="Alex Rivera" required />
        {fields["name"] && <span className="text-xs font-medium text-destructive">{fields["name"]}</span>}
      </label>}

      <label className="grid gap-2 text-sm font-semibold">
        Email
        <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" required />
        {fields["email"] && <span className="text-xs font-medium text-destructive">{fields["email"]}</span>}
      </label>

      <label className="grid gap-2 text-sm font-semibold">
        Password
        <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="At least 8 characters" required minLength={8} />
        {fields["password"] && <span className="text-xs font-medium text-destructive">{fields["password"]}</span>}
      </label>

      {mode === "signup" && <>
        <label className="grid gap-2 text-sm font-semibold">
          Phone (optional)
          <Input value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" placeholder="+1 555 010 2030" />
        </label>
        <fieldset className="grid gap-2">
          <legend className="text-sm font-semibold">I am signing up to…</legend>
          <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
            <input type="radio" name="intent" checked={!wantsBusiness} onChange={() => setWantsBusiness(false)} className="mt-1" />
            <span><b className="block">Find entertainment for my child</b><span className="text-muted-foreground">Save favourites, compare businesses and track your quote requests.</span></span>
          </label>
          <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
            <input type="radio" name="intent" checked={wantsBusiness} onChange={() => setWantsBusiness(true)} className="mt-1" />
            <span><b className="block">List my party business</b><span className="text-muted-foreground">Add a listing, track its review and read the quote requests you receive.</span></span>
          </label>
        </fieldset>
      </>}

      <Button type="submit" size="lg" disabled={busy}>
        {busy ? <><Loader2 className="animate-spin" />Working…</> : mode === "login" ? "Log in" : "Create account"}
      </Button>
    </form>

    <p className="mt-4 text-xs text-muted-foreground">
      Vendors and parents share one login. Admins are created on the server, never through this form.
    </p>
  </div>;
}

export function LoginPage() {
  return <main className="min-h-screen bg-surface pb-24">
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2">
      <div>
        <p className="font-bold text-primary">Your PartySprout account</p>
        <h1 className="mt-2 font-display text-4xl font-extrabold sm:text-5xl">Keep every party in one place.</h1>
        <p className="mt-4 text-lg leading-8 text-muted-foreground">
          An account saves the businesses you shortlist, keeps your quote requests together and — if
          you run a party business — lets you manage your listing and reply to parents.
        </p>
        <ul className="mt-8 space-y-3 text-sm">
          {[
            "Saved businesses follow you between devices",
            "Quote requests you sent are listed with vendor names",
            "Vendor accounts manage a listing and its leads",
            "Guests can still browse and request quotes without one",
          ].map((line) => <li key={line} className="flex items-start gap-3">
            <Check className="mt-0.5 size-4 shrink-0 text-success" /><span>{line}</span>
          </li>)}
        </ul>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button variant="outline" asChild><Link to="/search" search={{ q: "", location: "" }}>Browse first</Link></Button>
          <Button variant="ghost" asChild><Link to="/list-your-business">I run a business</Link></Button>
        </div>
      </div>
      <LoginPanel note="Use the same form to log in or create an account." />
    </div>
    <Footer />
  </main>;
}

/* ------------------------------------------------------------------------- */
/* Parent account                                                             */
/* ------------------------------------------------------------------------- */

function QuoteRow({ quote }: { quote: QuoteRequestRow }) {
  return <li className="rounded-lg border bg-background p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="font-display text-lg font-extrabold">
          {quote.vendor_name ? `For ${quote.vendor_name}` : "Sent to matching entertainers"}
        </p>
        <p className="text-sm text-muted-foreground">
          {[quote.city, quote.event_date, quote.guest_count ? `${quote.guest_count} children` : "", quote.budget]
            .filter(Boolean).join(" · ")}
        </p>
      </div>
      <span className="text-xs text-muted-foreground">{new Date(quote.created_at).toLocaleDateString()}</span>
    </div>
    {quote.details && <p className="mt-3 text-sm leading-7 text-muted-foreground">{quote.details}</p>}
    <div className="mt-4 flex flex-wrap gap-3 text-sm">
      {quote.vendor_slug && <Button size="sm" variant="outline" asChild>
        <Link to="/vendors/$slug" params={{ slug: quote.vendor_slug }}>View business</Link>
      </Button>}
      <Button size="sm" variant="ghost" asChild><Link to="/search" search={{ q: "", location: quote.city ?? "" }}>Find similar</Link></Button>
    </div>
  </li>;
}

export function AccountPage() {
  const { user, loading, logout, updateProfile, refresh } = useSession();
  const { ids } = useSaved();
  const [quotes, setQuotes] = useState<QuoteRequestRow[]>([]);
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (user) setName(user.name);
    if (user) setPhone(user.phone ?? "");
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void fetchMyQuoteRequests().then(setQuotes);
  }, [user]);

  if (loading) return <main className="grid min-h-screen place-items-center bg-surface"><p className="text-muted-foreground">Checking your account…</p></main>;

  if (!user) {
    return <main className="min-h-screen bg-surface pb-24">
      <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <p className="font-bold text-primary">My account</p>
        <h1 className="mt-2 font-display text-4xl font-extrabold">Log in to see your parties</h1>
        <p className="mt-4 text-lg leading-8 text-muted-foreground">
          Saved businesses, comparison lists and quote requests live in your account. Requests you sent
          before signing up are matched by email address, so they show up here too.
        </p>
        <div className="mt-8"><LoginPanel onDone={() => void refresh()} /></div>
      </div>
      <Footer />
    </main>;
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setStatus("saving");
    setMessage(null);
    const result = await updateProfile({ name, phone });
    if (!result.ok) {
      setMessage(result.message);
      setStatus("idle");
      return;
    }
    setStatus("saved");
  }

  return <main className="min-h-screen bg-surface pb-24">
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-primary">My account</p>
          <h1 className="font-display text-3xl font-extrabold">Hello, {user.name.split(" ")[0]}.</h1>
          <p className="mt-1 text-muted-foreground">
            {user.role === "admin" ? "Admin account" : user.role === "vendor" ? "Business account" : "Parent account"} · {user.email}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {user.role === "vendor" && <Button asChild><Link to="/vendor/dashboard">My business</Link></Button>}
          {user.role === "admin" && <Button asChild><Link to="/admin">Admin queue</Link></Button>}
          <Button variant="outline" onClick={() => void logout()}><LogOut />Log out</Button>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-2xl border bg-background p-6">
          <h2 className="font-display text-xl font-extrabold">Your quote requests</h2>
          <p className="mt-1 text-sm text-muted-foreground">Requests are stored in the database and shown newest first.</p>
          {quotes.length === 0
            ? <div className="mt-5 rounded-lg border bg-muted/40 p-5 text-sm text-muted-foreground">
              Nothing sent yet. <Link className="font-semibold underline" to="/request-quote">Send a quote request</Link> and it will appear here.
            </div>
            : <ul className="mt-5 space-y-4">{quotes.map((quote) => <QuoteRow key={quote.id} quote={quote} />)}</ul>}
        </section>

        <div className="space-y-6">
          <section className="rounded-2xl border bg-background p-6">
            <h2 className="font-display text-xl font-extrabold">Your details</h2>
            {message && <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{message}</p>}
            <form onSubmit={save} className="mt-4 grid gap-4">
              <label className="grid gap-2 text-sm font-semibold">
                Name
                <Input value={name} onChange={(event) => setName(event.target.value)} required />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Phone (optional)
                <Input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Email
                <Input value={user.email} disabled />
                <span className="text-xs font-normal text-muted-foreground">Email changes go through support, so no one can take over an account.</span>
              </label>
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={status === "saving"}>{status === "saving" ? "Saving…" : "Save details"}</Button>
                {status === "saved" && <span className="inline-flex items-center gap-1 text-sm font-semibold text-success"><Check className="size-4" />Saved</span>}
              </div>
            </form>
          </section>

          <section className="rounded-2xl border bg-background p-6">
            <h2 className="font-display text-xl font-extrabold">Shortlist</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {ids.length === 0 ? "You have not saved any businesses yet." : `${ids.length} saved ${ids.length === 1 ? "business" : "businesses"}.`}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild><Link to="/favorites"><Heart />Saved</Link></Button>
              <Button variant="outline" size="sm" asChild><Link to="/compare"><Scale />Compare</Link></Button>
            </div>
          </section>
        </div>
      </div>
    </div>
    <Footer />
  </main>;
}

/* ------------------------------------------------------------------------- */
/* Saved businesses and comparison                                            */
/* ------------------------------------------------------------------------- */

function useVendorsByIds(ids: number[]) {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchListingsByIds(ids).then((rows) => {
      if (cancelled) return;
      setVendors(rows);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [ids.join(",")]);

  return { vendors, loading };
}

export function SavedPage() {
  const { ids, compareIds, clearCompare } = useSaved();
  const { user } = useSession();
  const { vendors, loading } = useVendorsByIds(ids);

  return <main className="min-h-screen bg-surface pb-24">
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <p className="text-sm font-bold text-primary">Your shortlist</p>
      <h1 className="font-display text-3xl font-extrabold">Saved entertainers</h1>
      <p className="mt-1 max-w-2xl text-muted-foreground">
        {user
          ? "Saved to your account, so the list is the same on every device you log in from."
          : "Saved in this browser. Log in and the list moves into your account automatically."}
      </p>

      {loading ? <p className="mt-8 rounded-lg border bg-background p-8 text-muted-foreground">Loading your shortlist…</p>
        : vendors.length === 0
          ? <div className="mt-8 rounded-2xl border bg-background p-8">
            <h2 className="font-display text-xl font-extrabold">Nothing saved yet</h2>
            <p className="mt-2 max-w-xl text-sm leading-7 text-muted-foreground">
              Tap the heart on any business while you browse and it lands here — no account needed.
            </p>
            <Button className="mt-5" asChild><Link to="/search" search={{ q: "", location: "" }}>Browse businesses</Link></Button>
          </div>
          : <div className="mt-8 grid gap-5 lg:grid-cols-2">{vendors.map((vendor) => <VendorCard key={vendor.id} vendor={vendor} showCompare />)}</div>}
    </div>

    {compareIds.length > 0 && <div className="fixed inset-x-4 bottom-20 z-40 mx-auto flex max-w-xl items-center gap-3 rounded-lg bg-foreground p-3 text-background shadow-2xl md:bottom-5">
      <span className="mr-auto text-sm font-bold">{compareIds.length} selected</span>
      <Button variant="secondary" size="sm" asChild><Link to="/compare">Compare now</Link></Button>
      <Button variant="ghost" size="icon" onClick={clearCompare} aria-label="Clear comparison">×</Button>
    </div>}
  </main>;
}

export function ComparePage() {
  const { compareIds, clearCompare, toggleCompare } = useSaved();
  const { vendors, loading } = useVendorsByIds(compareIds);

  const rows = useMemo(() => [
    { label: "Category", value: (vendor: Vendor) => vendor.category },
    { label: "Location", value: (vendor: Vendor) => vendor.location || "Not listed" },
    {
      label: "Rating",
      value: (vendor: Vendor) => vendor.rating > 0 ? <Rating value={vendor.rating} reviews={vendor.reviews} /> : <span className="text-muted-foreground">Not rated</span>,
    },
    {
      label: "Starting price",
      value: (vendor: Vendor) => vendor.price > 0 ? <b>${vendor.price}</b> : <span className="text-muted-foreground">Not published — ask for a quote</span>,
    },
    { label: "Phone", value: (vendor: Vendor) => vendor.phone || <span className="text-muted-foreground">Not listed</span> },
    {
      label: "Website",
      value: (vendor: Vendor) => vendor.website
        ? <a className="font-semibold text-primary underline" href={vendor.website} target="_blank" rel="noreferrer">Open site</a>
        : <span className="text-muted-foreground">Not listed</span>,
    },
    { label: "What they offer", value: (vendor: Vendor) => <span className="text-sm text-muted-foreground">{vendor.description || "No description yet."}</span> },
  ] as const, []);

  return <main className="min-h-screen bg-surface pb-24">
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <p className="text-sm font-bold text-primary">Side by side</p>
      <h1 className="font-display text-3xl font-extrabold">Compare businesses</h1>
      <p className="mt-1 max-w-2xl text-muted-foreground">
        Everything below comes straight from the listing. Where a business has not published a price,
        it says so instead of showing a made-up number.
      </p>

      {compareIds.length === 0 ? (
        <div className="mt-8 rounded-2xl border bg-background p-8">
          <h2 className="font-display text-xl font-extrabold">Nothing to compare yet</h2>
          <p className="mt-2 max-w-xl text-sm leading-7 text-muted-foreground">
            Tick “Compare” on up to four businesses in search results, then come back here.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild><Link to="/search" search={{ q: "", location: "" }}>Go to search</Link></Button>
            <Button variant="outline" asChild><Link to="/favorites">Open my shortlist</Link></Button>
          </div>
        </div>
      ) : loading ? <p className="mt-8 rounded-lg border bg-background p-8 text-muted-foreground">Loading comparison…</p> : (
        <>
          <div className="mt-6 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{vendors.length} of {compareIds.length} still in the directory.</p>
            <Button variant="ghost" size="sm" onClick={clearCompare}>Clear comparison</Button>
          </div>
          <div className="mt-4 overflow-x-auto rounded-2xl border bg-background">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr>
                  <th className="w-40 border-b p-4 text-sm font-bold text-muted-foreground">Business</th>
                  {vendors.map((vendor) => <th key={vendor.id} className="border-b p-4 align-top">
                    <div className="flex items-start gap-3">
                      <VendorLogo vendor={vendor} className="size-10 rounded-lg" />
                      <div>
                        <Link to="/vendors/$slug" params={{ slug: vendor.slug }} className="font-display text-base font-extrabold hover:text-primary">{vendor.name}</Link>
                        <button type="button" onClick={() => toggleCompare(vendor.id)} className="mt-1 block text-xs font-semibold text-muted-foreground hover:text-destructive">Remove</button>
                      </div>
                    </div>
                  </th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => <tr key={row.label} className="odd:bg-muted/30">
                  <th className="border-b p-4 align-top text-sm font-bold">{row.label}</th>
                  {vendors.map((vendor) => <td key={vendor.id} className="border-b p-4 align-top text-sm">{row.value(vendor)}</td>)}
                </tr>)}
                <tr>
                  <th className="p-4 text-sm font-bold">Next step</th>
                  {vendors.map((vendor) => <td key={vendor.id} className="p-4">
                    <Button size="sm" asChild><Link to="/request-quote" search={{ vendor: vendor.slug }}><Send />Request quote</Link></Button>
                  </td>)}
                </tr>
              </tbody>
            </table>
          </div>
        </>)}
    </div>
  </main>;
}

/* ------------------------------------------------------------------------- */
/* My quotes                                                                  */
/* ------------------------------------------------------------------------- */

export function QuotesPage() {
  const { user, loading, refresh } = useSession();
  const [quotes, setQuotes] = useState<QuoteRequestRow[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!user) {
      setFetching(false);
      return;
    }
    setFetching(true);
    void fetchMyQuoteRequests().then((rows) => {
      setQuotes(rows);
      setFetching(false);
    });
  }, [user]);

  if (loading) return <main className="grid min-h-screen place-items-center bg-surface"><p className="text-muted-foreground">Checking your account…</p></main>;

  return <main className="min-h-screen bg-surface pb-24">
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <p className="text-sm font-bold text-primary">Your requests</p>
      <h1 className="font-display text-3xl font-extrabold">My quote requests</h1>
      <p className="mt-1 max-w-2xl text-muted-foreground">
        Requests are saved against your email address, so anything you sent before creating an account
        appears here too.
      </p>

      {!user ? (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border bg-background p-6">
            <h2 className="font-display text-xl font-extrabold">Log in to see your requests</h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              Entertainers reply by email or phone, so the request itself works without an account —
              logging in just keeps every request in one list.
            </p>
            <Button className="mt-5" variant="outline" asChild><Link to="/request-quote">Send a new request</Link></Button>
          </div>
          <LoginPanel onDone={() => void refresh()} />
        </div>
      ) : fetching ? <p className="mt-8 rounded-lg border bg-background p-8 text-muted-foreground">Loading your requests…</p>
        : quotes.length === 0 ? <div className="mt-8 rounded-2xl border bg-background p-8">
          <h2 className="font-display text-xl font-extrabold">No quote requests yet</h2>
          <p className="mt-2 max-w-xl text-sm leading-7 text-muted-foreground">
            Tell us about the party once and we pass it to entertainers who cover your city and date.
            Replies arrive by email, usually within a day or two.
          </p>
          <Button className="mt-5" asChild><Link to="/request-quote"><Send />Request a quote</Link></Button>
        </div>
        : <>
          <p className="mt-6 text-sm text-muted-foreground">{quotes.length} request{quotes.length === 1 ? "" : "s"} on record.</p>
          <ul className="mt-4 space-y-4">{quotes.map((quote) => <QuoteRow key={quote.id} quote={quote} />)}</ul>
        </>}
    </div>
    <Footer />
  </main>;
}

/* ------------------------------------------------------------------------- */
/* Party builder                                                              */
/* ------------------------------------------------------------------------- */

const BUILDER_BUDGETS = ["Under $200", "$200 – $400", "$400 – $700", "$700 – $1,000", "$1,000+", "Not sure yet"];

/**
 * The builder is a shortlist tool, not a price calculator: it filters the live
 * directory by what the parent wants and hands the same answers to the quote
 * request. It never invents a total.
 */
export function PartyBuilderPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [category, setCategory] = useState("");
  const [city, setCity] = useState("");
  const [date, setDate] = useState("");
  const [kids, setKids] = useState("");
  const [budget, setBudget] = useState("");
  const [matches, setMatches] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => { void fetchCategories().then(setCategories); }, []);

  useEffect(() => {
    const term = city.trim();
    if (term.length < 2) { setCities([]); return; }
    let cancelled = false;
    const timer = setTimeout(() => { void fetchCitySuggestions(term).then((rows) => { if (!cancelled) setCities(rows); }); }, 180);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [city]);

  async function find(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setSearched(true);
    const data = await fetchListings({ category, location: city, pageSize: 6 });
    setMatches(data.items);
    setLoading(false);
  }

  const query = { city, date, kids, category };

  return <main className="min-h-screen bg-surface pb-24">
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <div className="max-w-3xl">
        <p className="font-bold text-primary">Build my party</p>
        <h1 className="mt-2 font-display text-4xl font-extrabold sm:text-5xl">Tell us the party. We find the people.</h1>
        <p className="mt-4 text-lg leading-8 text-muted-foreground">
          Pick the entertainment, the city, the date and how many children are coming. You will get a
          shortlist from the live directory and can send one quote request covering all of it.
        </p>
      </div>

      <form onSubmit={find} className="mt-9 grid gap-5 rounded-2xl border bg-background p-6 sm:p-8 lg:grid-cols-2" noValidate>
        <label className="grid gap-2 text-sm font-semibold">
          What kind of entertainment?
          <select value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Anything that fits</option>
            {categories.map((option) => <option key={option.slug} value={option.slug}>{option.name} ({option.count})</option>)}
          </select>
        </label>

        <label className="grid gap-2 text-sm font-semibold">
          Which city?
          <Input value={city} onChange={(event) => setCity(event.target.value)} list="builder-city-options" placeholder="Dallas" autoComplete="off" />
          <datalist id="builder-city-options">
            {cities.map((option) => <option key={`${option.name}-${option.stateCode}`} value={option.name}>{option.label}</option>)}
          </datalist>
        </label>

        <label className="grid gap-2 text-sm font-semibold">
          When is the party?
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>

        <label className="grid gap-2 text-sm font-semibold">
          How many children?
          <Input type="number" min="1" value={kids} onChange={(event) => setKids(event.target.value)} placeholder="15" />
        </label>

        <label className="grid gap-2 text-sm font-semibold lg:col-span-2">
          Rough budget
          <select value={budget} onChange={(event) => setBudget(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Not sure yet</option>
            {BUILDER_BUDGETS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <span className="text-xs font-normal text-muted-foreground">
            We pass this to entertainers so their quotes are realistic — it is not a filter, because
            most businesses quote per party rather than publish a fixed price.
          </span>
        </label>

        <div className="lg:col-span-2">
          <Button type="submit" size="lg" disabled={loading}>{loading ? <><Loader2 className="animate-spin" />Finding…</> : <><WandSparkles />Find entertainers</>}</Button>
        </div>
      </form>

      {searched && <section className="mt-10">
        <h2 className="font-display text-2xl font-extrabold">
          {loading ? "Looking through the directory…" : matches.length > 0 ? `${matches.length} businesses fit so far` : "No business matches those choices yet"}
        </h2>
        {!loading && matches.length === 0 && <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
          Try a wider city or leave the entertainment type open — then send a quote request and let
          entertainers tell you what they can do.
        </p>}
        {matches.length > 0 && <>
          <div className="mt-6 grid gap-5 lg:grid-cols-2">{matches.map((vendor) => <VendorCard key={vendor.id} vendor={vendor} />)}</div>
          <div className="mt-8 flex flex-wrap items-center gap-4 rounded-2xl border bg-background p-6">
            <Sparkles className="size-5 text-primary" />
            <p className="mr-auto text-sm">
              Happy with these? Send one request with your date, city{kids ? `, ${kids} children` : ""}
              {budget ? ` and the ${budget} budget` : ""}.
            </p>
            <Button asChild><Link to="/request-quote" search={query}><Send />Send one quote request</Link></Button>
            <Button variant="outline" asChild><Link to="/search" search={{ q: "", location: city }}>See all results</Link></Button>
          </div>
        </>}
      </section>}
    </div>
    <Footer />
  </main>;
}

/* ------------------------------------------------------------------------- */
/* Small pieces                                                               */
/* ------------------------------------------------------------------------- */

export function NotBuiltYet({ title, what, instead }: { title: string; what: string; instead?: ReactNode }) {
  return <main className="min-h-screen bg-surface pb-24">
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <p className="text-sm font-bold text-primary">Not part of PartySprout yet</p>
      <h1 className="mt-2 font-display text-3xl font-extrabold">{title}</h1>
      <p className="mt-4 text-lg leading-8 text-muted-foreground">{what}</p>
      <p className="mt-4 text-sm text-muted-foreground">
        This page used to show sample data. It now says so plainly rather than pretending to be a
        working feature. Questions? Email{" "}
        <a className="font-semibold text-primary underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>
      {instead && <div className="mt-8 flex flex-wrap gap-2">{instead}</div>}
    </div>
    <Footer />
  </main>;
}
