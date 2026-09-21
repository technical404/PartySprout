import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle, BadgeCheck, Building2, Check, ExternalLink, Inbox, Loader2, Mail, MapPin, Phone,
  Plus, Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Footer } from "./footer";
import { LoginPanel } from "./account-pages";
import { api, type BusinessSubmission, type OwnedListing } from "@/lib/api";
import {
  fetchCategories, fetchCitySuggestions, mapVendor, type Category, type City, type QuoteRequestRow,
} from "@/lib/marketplace-data";
import { useSession } from "@/lib/session";
import { SUPPORT_EMAIL } from "@/lib/site";

const STATUS_COPY: Record<string, { label: string; className: string; blurb: string }> = {
  active: {
    label: "Live",
    className: "border-success/30 bg-success-soft text-success",
    blurb: "Visible in search and on your public page.",
  },
  pending: {
    label: "In review",
    className: "border-rating/40 bg-rating-soft text-foreground",
    blurb: "An admin checks new businesses before they go live. Usually within a day.",
  },
  rejected: {
    label: "Not approved",
    className: "border-destructive/30 bg-destructive/5 text-destructive",
    blurb: "Fix anything noted below and save — that puts it back in the review queue.",
  },
};

export function StatusChip({ status }: { status: string }) {
  const copy = STATUS_COPY[status] ?? STATUS_COPY["pending"]!;
  return <span className={`rounded-full border px-3 py-1 text-xs font-bold ${copy.className}`}>{copy.label}</span>;
}

type FormValues = {
  name: string;
  categorySlug: string;
  city: string;
  website: string;
  phone: string;
  email: string;
  priceFrom: string;
  description: string;
};

const EMPTY: FormValues = {
  name: "", categorySlug: "", city: "", website: "", phone: "", email: "", priceFrom: "", description: "",
};

/**
 * One form for both a brand-new business and an edit of an existing listing, so
 * the fields an admin reviews are exactly the fields the vendor maintains.
 */
function BusinessForm({ listing, onSaved }: { listing?: OwnedListing | undefined; onSaved: () => void }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [values, setValues] = useState<FormValues>(() => ({
    ...EMPTY,
    name: listing?.name ?? "",
    categorySlug: listing?.category_slug ?? "",
    city: listing?.city_name ?? "",
    website: listing?.website ?? "",
    phone: listing?.phone ?? "",
    email: listing?.email ?? "",
    priceFrom: listing?.price_from ? String(listing.price_from) : "",
    description: listing?.description ?? "",
  }));
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  useEffect(() => { void fetchCategories().then(setCategories); }, []);

  useEffect(() => {
    const term = values.city.trim();
    if (term.length < 2) {
      setCities([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void fetchCitySuggestions(term).then((rows) => { if (!cancelled) setCities(rows); });
    }, 180);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [values.city]);

  const set = (key: keyof FormValues) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("saving");
    setError(null);
    setFields({});

    const payload: BusinessSubmission = {
      name: values.name,
      categorySlug: values.categorySlug,
      cityText: values.city,
      website: values.website,
      phone: values.phone,
      email: values.email,
      priceFrom: values.priceFrom,
      description: values.description,
    };
    const result = listing
      ? await api.updateBusiness(listing.id, payload)
      : await api.submitBusiness(payload);

    if (!result.ok) {
      setError(result.message);
      setFields(result.fields ?? {});
      setStatus("idle");
      return;
    }
    setStatus("saved");
    onSaved();
  }

  const fieldError = (key: string) => fields[key] ?? fields[`${key}Text`] ?? fields["city"];

  if (status === "saved") {
    return <div className="rounded-2xl border bg-background p-8 text-center shadow-sm">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-success-soft text-success"><Check className="size-7" /></span>
      <h2 className="mt-4 font-display text-2xl font-extrabold">
        {listing ? "Changes saved." : "Your business is in the review queue."}
      </h2>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-muted-foreground">
        {listing
          ? "Live details update straight away. If the listing had been rejected it goes back to review."
          : "An admin checks new businesses before they appear in search, so the directory stays real. You can track the status in your dashboard."}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button variant="outline" onClick={() => setStatus("idle")}>Edit details again</Button>
        <Button asChild><Link to="/vendor/dashboard">Go to my dashboard</Link></Button>
      </div>
    </div>;
  }

  return <form onSubmit={submit} className="rounded-2xl border bg-background p-6 shadow-sm sm:p-9" noValidate>
    {error && <div role="alert" className="mb-6 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
      <AlertCircle className="mt-0.5 size-5 shrink-0" />
      <p>{error} You can also email <a className="font-semibold underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
    </div>}

    <div className="grid gap-5 sm:grid-cols-2">
      <label className="grid gap-2 text-sm font-semibold sm:col-span-2">
        Business name
        <Input value={values.name} onChange={set("name")} placeholder="Dallas Superhero Parties" required />
        {fieldError("name") && <span className="text-xs font-medium text-destructive">{fieldError("name")}</span>}
      </label>

      <label className="grid gap-2 text-sm font-semibold">
        Category
        <select
          value={values.categorySlug}
          onChange={(event) => setValues((current) => ({ ...current, categorySlug: event.target.value }))}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          required
        >
          <option value="">Pick the closest fit</option>
          {categories.map((category) => <option key={category.slug} value={category.slug}>{category.name}</option>)}
        </select>
        {fields["categorySlug"] && <span className="text-xs font-medium text-destructive">{fields["categorySlug"]}</span>}
      </label>

      <label className="grid gap-2 text-sm font-semibold">
        City you serve
        <Input value={values.city} onChange={set("city")} list="business-city-options" placeholder="Dallas" autoComplete="off" required />
        <datalist id="business-city-options">
          {cities.map((city) => <option key={`${city.name}-${city.stateCode}`} value={city.name}>{city.label}</option>)}
        </datalist>
        {fieldError("city") && <span className="text-xs font-medium text-destructive">{fieldError("city")}</span>}
      </label>

      <label className="grid gap-2 text-sm font-semibold">
        Website (optional)
        <Input value={values.website} onChange={set("website")} placeholder="https://example.com" />
        {fields["website"] && <span className="text-xs font-medium text-destructive">{fields["website"]}</span>}
      </label>

      <label className="grid gap-2 text-sm font-semibold">
        Phone (optional)
        <Input value={values.phone} onChange={set("phone")} placeholder="+1 555 010 2030" />
      </label>

      <label className="grid gap-2 text-sm font-semibold">
        Booking email (optional)
        <Input type="email" value={values.email} onChange={set("email")} placeholder="bookings@example.com" />
        {fields["email"] && <span className="text-xs font-medium text-destructive">{fields["email"]}</span>}
      </label>

      <label className="grid gap-2 text-sm font-semibold">
        Starting price (optional)
        <Input inputMode="numeric" value={values.priceFrom} onChange={set("priceFrom")} placeholder="250" />
        <span className="text-xs font-normal text-muted-foreground">
          Only if you have a real starting price. Leave it blank and the card simply shows no price —
          searches can then never promise a budget you cannot meet.
        </span>
        {fields["priceFrom"] && <span className="text-xs font-medium text-destructive">{fields["priceFrom"]}</span>}
      </label>

      <label className="grid gap-2 text-sm font-semibold sm:col-span-2">
        What you offer
        <Textarea rows={6} value={values.description} onChange={set("description")} placeholder="Characters, party length, travel area, what is included…" />
        {fields["description"] && <span className="text-xs font-medium text-destructive">{fields["description"]}</span>}
      </label>
    </div>

    <div className="mt-8 flex flex-wrap items-center gap-4">
      <Button type="submit" size="lg" disabled={status === "saving"}>
        {status === "saving" ? <><Loader2 className="animate-spin" />Saving…</> : <><Save />{listing ? "Save changes" : "Submit for review"}</>}
      </Button>
      <p className="text-xs text-muted-foreground">New and edited listings are reviewed by a person — no payment is involved.</p>
    </div>
  </form>;
}

export function ListBusinessPage() {
  const { user, loading, refresh } = useSession();

  if (loading) {
    return <Centered note="Checking your account…" />;
  }

  if (!user) {
    return <main className="min-h-screen bg-surface pb-24">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <p className="font-bold text-primary">List your business</p>
        <h1 className="mt-2 font-display text-4xl font-extrabold sm:text-5xl">Get found by local families.</h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">
          Create a free account first — it is how you track the review status, edit your details and
          read the quote requests that come in.
        </p>
        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="rounded-2xl border bg-background p-6 sm:p-9">
            <h2 className="font-display text-xl font-extrabold">What happens after you submit</h2>
            <ol className="mt-5 space-y-4 text-sm text-muted-foreground">
              <li><b className="text-foreground">1. You fill in the listing.</b> Category, city, what you offer, and a starting price only if you have one.</li>
              <li><b className="text-foreground">2. A person reviews it.</b> New businesses stay hidden until they are approved, so search results stay trustworthy.</li>
              <li><b className="text-foreground">3. You get quote requests.</b> Parents send the date, city, party size and budget; you reply by email or phone.</li>
            </ol>
          </div>
          <LoginPanel
            intent="vendor"
            note="Log in or create a vendor account to add your business."
            onDone={() => void refresh()}
          />
        </div>
      </div>
      <Footer />
    </main>;
  }

  return <main className="min-h-screen bg-surface pb-24">
    <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
      <p className="font-bold text-primary">List your business</p>
      <h1 className="mt-2 font-display text-4xl font-extrabold sm:text-5xl">Add your party business.</h1>
      <p className="mt-4 max-w-3xl text-lg leading-8 text-muted-foreground">
        Signed in as {user.name} ({user.email}). Everything below goes to the review queue, and you can
        change any of it later from your dashboard.
      </p>
      {user.listingId ? (
        <div className="mt-10 rounded-2xl border bg-background p-8">
          <h2 className="font-display text-xl font-extrabold">You already manage a listing</h2>
          <p className="mt-2 text-sm text-muted-foreground">Edit it from your dashboard, or add a second city from there.</p>
          <Button className="mt-5" asChild><Link to="/vendor/dashboard">Open my dashboard</Link></Button>
        </div>
      ) : (
        <div className="mt-10 max-w-3xl"><BusinessForm onSaved={() => void refresh()} /></div>
      )}
    </div>
    <Footer />
  </main>;
}

function Centered({ note }: { note: string }) {
  return <main className="grid min-h-screen place-items-center bg-surface"><p className="text-muted-foreground">{note}</p></main>;
}

function LeadRow({ lead }: { lead: QuoteRequestRow }) {
  return <li className="rounded-lg border bg-background p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="font-display text-lg font-extrabold">{lead.name}</p>
        <p className="text-sm text-muted-foreground">
          {[lead.city, lead.event_date, lead.guest_count ? `${lead.guest_count} children` : "", lead.budget]
            .filter(Boolean).join(" · ") || "No party details supplied"}
        </p>
      </div>
      <span className="text-xs text-muted-foreground">{new Date(lead.created_at).toLocaleDateString()}</span>
    </div>
    {lead.details && <p className="mt-3 whitespace-pre-line text-sm leading-7">{lead.details}</p>}
    <div className="mt-4 flex flex-wrap gap-3 text-sm">
      <a className="inline-flex items-center gap-2 font-semibold text-primary" href={`mailto:${lead.email}`}><Mail className="size-4" />{lead.email}</a>
      {lead.phone && <a className="inline-flex items-center gap-2 font-semibold text-primary" href={`tel:${lead.phone}`}><Phone className="size-4" />{lead.phone}</a>}
    </div>
  </li>;
}

export function VendorDashboardPage({ focus = "listings" }: { focus?: "listings" | "leads" | "profile" }) {
  const { user, loading, refresh } = useSession();
  const [listings, setListings] = useState<OwnedListing[]>([]);
  const [leads, setLeads] = useState<QuoteRequestRow[]>([]);
  const [fetching, setFetching] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useMemo(() => async () => {
    setFetching(true);
    const [mine, incoming] = await Promise.all([api.myListings(), api.myLeads()]);
    if (mine.ok) setListings(mine.data.items ?? []);
    if (incoming.ok) setLeads(incoming.data.items ?? []);
    setFetching(false);
  }, []);

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user, load]);

  useEffect(() => {
    if (focus === "profile" && listings.length > 0) setEditing(listings[0]!.id);
  }, [focus, listings]);

  if (loading) return <Centered note="Checking your account…" />;

  if (!user) {
    return <main className="min-h-screen bg-surface pb-24">
      <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <p className="font-bold text-primary">For entertainers</p>
        <h1 className="mt-2 font-display text-4xl font-extrabold">Your business dashboard</h1>
        <p className="mt-4 text-lg leading-8 text-muted-foreground">
          Log in to manage your listing and read the quote requests parents send you.
        </p>
        <div className="mt-8"><LoginPanel intent="vendor" note="Vendor accounts see their own listing and leads only." onDone={() => void refresh()} /></div>
      </div>
      <Footer />
    </main>;
  }

  const editingListing = listings.find((row) => row.id === editing);

  return <main className="min-h-screen bg-surface pb-24">
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-primary">For entertainers</p>
          <h1 className="font-display text-3xl font-extrabold">Hi {user.name.split(" ")[0]}, here is your business.</h1>
          <p className="mt-1 text-muted-foreground">
            {fetching ? "Loading…" : listings.length === 0 ? "No listing yet." : `${listings.length} listing${listings.length === 1 ? "" : "s"} · ${leads.length} quote request${leads.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={fetching}>Refresh</Button>
          {listings.length === 0
            ? <Button asChild><Link to="/list-your-business"><Plus />Add my business</Link></Button>
            : <Button onClick={() => { setEditing(null); setShowForm(true); }}><Plus />Edit a listing</Button>}
        </div>
      </div>

      {listings.length === 0 ? (
        <div className="mt-8 rounded-2xl border bg-background p-8">
          <h2 className="font-display text-xl font-extrabold">You are not in the directory yet</h2>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
            Add your business and an admin will review it. Until then it stays out of search, and no
            parent can accidentally request a quote from a listing that does not exist.
          </p>
          <Button className="mt-5" asChild><Link to="/list-your-business">List my business</Link></Button>
        </div>
      ) : <>
        <section className="mt-8 grid gap-5 lg:grid-cols-2" aria-label="Your listings">
          {listings.map((listing) => {
            const vendor = mapVendor(listing);
            const copy = STATUS_COPY[listing.status ?? "pending"]!;
            return <article key={listing.id} className="rounded-2xl border bg-background p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Building2 className="size-5 text-primary" />
                  <div>
                    <h2 className="font-display text-xl font-extrabold">{listing.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      {[listing.category_name, listing.city_name].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>
                <StatusChip status={listing.status ?? "pending"} />
              </div>
              <p className="mt-4 text-sm text-muted-foreground">{copy.blurb}</p>
              {listing.review_note && <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                Reviewer note: {listing.review_note}
              </p>}
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-muted-foreground">Starting price</dt><dd className="font-semibold">{listing.price_from ? `$${listing.price_from}` : "Not published"}</dd></div>
                <div><dt className="text-muted-foreground">Phone</dt><dd className="font-semibold">{listing.phone || "—"}</dd></div>
                <div><dt className="text-muted-foreground">Website</dt><dd className="font-semibold">{listing.website ? "Linked" : "—"}</dd></div>
                <div><dt className="text-muted-foreground">Category</dt><dd className="font-semibold">{listing.category_name}</dd></div>
              </dl>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => { setEditing(listing.id); setShowForm(true); }}>Edit listing</Button>
                {listing.status === "active" && <Button size="sm" variant="outline" asChild>
                  <Link to="/vendors/$slug" params={{ slug: vendor.slug }}><ExternalLink />View public page</Link>
                </Button>}
              </div>
            </article>;
          })}
        </section>

        {showForm && <section className="mt-8 rounded-2xl border bg-background p-6 sm:p-8">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-extrabold">{editingListing ? `Edit ${editingListing.name}` : "Edit a listing"}</h2>
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Close</Button>
          </div>
          {editingListing
            ? <div className="mt-5"><BusinessForm listing={editingListing} onSaved={() => { void load(); void refresh(); }} /></div>
            : <div className="mt-5 grid gap-2">
              {listings.map((listing) => <Button key={listing.id} variant="outline" onClick={() => setEditing(listing.id)}>Edit {listing.name}</Button>)}
            </div>}
        </section>}

        <section className="mt-10" aria-label="Quote requests">
          <h2 className="font-display text-2xl font-extrabold">Quote requests</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every request sent to your business through the quote form or from your public page.
          </p>
          {leads.length === 0
            ? <div className="mt-5 flex items-start gap-3 rounded-2xl border bg-background p-6">
              <Inbox className="mt-0.5 size-5 text-primary" />
              <p className="text-sm text-muted-foreground">
                No requests yet. Requests appear here the moment a parent sends one — you also get the
                contact details by email.
              </p>
            </div>
            : <ul className="mt-5 space-y-4">{leads.map((lead) => <LeadRow key={lead.id} lead={lead} />)}</ul>}
        </section>
      </>}

      <section className="mt-10 grid gap-4 sm:grid-cols-3">
        <Fact icon={MapPin} title="Where you appear" copy="Your city and state decide which location searches find you." />
        <Fact icon={BadgeCheck} title="Approval" copy="New and edited listings are reviewed by a person, never auto-published." />
        <Fact icon={Mail} title="Replies" copy="Parents contact you directly by email or phone — there is no in-app inbox." />
      </section>
    </div>
    <Footer />
  </main>;
}

function Fact({ icon: Icon, title, copy }: { icon: typeof MapPin; title: string; copy: string }) {
  return <div className="rounded-lg border bg-background p-5">
    <Icon className="size-5 text-primary" />
    <h3 className="mt-3 font-display text-base font-extrabold">{title}</h3>
    <p className="mt-1 text-sm text-muted-foreground">{copy}</p>
  </div>;
}
