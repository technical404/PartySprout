import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BadgeCheck, Building2, CalendarDays, Compass, Filter, Heart, Home, MapPin, Menu, MessageCircle, Search, ShieldCheck, SlidersHorizontal, Star, UserRound, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  EMPTY_SEARCH, fetchCategories, fetchCitySuggestions, fetchDirectorySummary, fetchListings,
  type Category, type City, type DirectorySummary, type SearchState, type SortKey, type Vendor,
} from "@/lib/marketplace-data";
import { useSaved } from "@/lib/saved";
import { useSession } from "@/lib/session";
import { Brand } from "./footer";
import { QuoteDialog } from "./quote-form";

// Re-exported so existing importers keep working (pages.tsx, home-sections.tsx).
export { Brand, Footer } from "./footer";
// The fake 8-step dialog that used to live here is replaced by the real form.
export { QuoteDialog } from "./quote-form";

export function SiteHeader() {
  const { user, logout } = useSession();
  const workspace: "/account" | "/admin" | "/vendor/dashboard" =
    user?.role === "admin" ? "/admin" : user?.role === "vendor" ? "/vendor/dashboard" : "/account";
  const firstName = user?.name?.split(" ")[0] ?? "";
  const closeAndLogout = () => void logout();

  return <>
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-xl">
      <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Brand />
        <nav className="hidden items-center gap-7 lg:flex" aria-label="Main navigation">
          <Link to="/explore" className="nav-link">Explore</Link>
          <Link to="/category/$slug" params={{ slug: "superheroes" }} className="nav-link">Categories</Link>
          <Link to="/party-builder" className="nav-link">Party builder</Link>
          <Link to="/favorites" className="nav-link">Saved</Link>
          <Link to="/list-your-business" className="nav-link">For entertainers</Link>
        </nav>
        <div className="hidden items-center gap-2 sm:flex">
          {user ? <>
            <Button variant="ghost" asChild><Link to={workspace}>Hi, {firstName}</Link></Button>
            <Button variant="ghost" onClick={closeAndLogout}>Log out</Button>
          </> : (
            <Button variant="ghost" asChild><Link to="/login">Log in</Link></Button>
          )}
          <Button variant="outline" asChild><Link to="/list-your-business">List your business</Link></Button>
          <Button asChild><Link to="/search" search={{ q: "", location: "" }}>Find businesses</Link></Button>
        </div>
        <Sheet><SheetTrigger asChild><Button variant="ghost" size="icon" className="sm:hidden" aria-label="Open menu"><Menu /></Button></SheetTrigger>
          <SheetContent><SheetHeader><SheetTitle><Brand /></SheetTitle><SheetDescription>Everything for an unforgettable party.</SheetDescription></SheetHeader>
            <nav className="mt-8 grid gap-2">
              <MobileLink to="/explore">Explore</MobileLink>
              <MobileLink to="/party-builder">Build my party</MobileLink>
              <MobileLink to="/favorites">Saved entertainers</MobileLink>
              <MobileLink to="/list-your-business">List your business</MobileLink>
              {user ? <>
                <MobileLink to={workspace}>Hi, {firstName}</MobileLink>
                <button type="button" onClick={closeAndLogout} className="rounded-lg px-4 py-3 text-left text-base font-semibold hover:bg-muted">Log out</button>
              </> : <MobileLink to="/login">Log in</MobileLink>}
            </nav>
          </SheetContent></Sheet>
      </div>
    </header>
  </>;
}

type MobileLinkTarget = "/explore" | "/party-builder" | "/favorites" | "/vendor/dashboard" | "/account" | "/login" | "/list-your-business" | "/admin";

function MobileLink({ to, children }: { to: MobileLinkTarget; children: ReactNode }) {
  return <Link to={to} className="rounded-lg px-4 py-3 text-base font-semibold hover:bg-muted">{children}</Link>;
}

export function MobileNav() {
  return <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-background/95 px-2 pb-[env(safe-area-inset-bottom)] pt-2 backdrop-blur-xl md:hidden" aria-label="Mobile navigation">
    <MobileNavLink to="/" icon={<Home />} label="Home" /><MobileNavLink to="/explore" icon={<Compass />} label="Explore" /><MobileNavLink to="/favorites" icon={<Heart />} label="Saved" /><MobileNavLink to="/quotes" icon={<MessageCircle />} label="Quotes" /><MobileNavLink to="/account" icon={<UserRound />} label="Account" />
  </nav>;
}

function MobileNavLink({ to, icon, label }: { to: "/" | "/explore" | "/favorites" | "/quotes" | "/account"; icon: ReactNode; label: string }) {
  return <Link to={to} className="flex min-h-14 flex-col items-center gap-1 text-[11px] font-semibold text-muted-foreground data-[status=active]:text-primary [&_svg]:size-5">{icon}{label}</Link>;
}

/**
 * Hero/compact search. The date and children fields are carried into the search
 * URL and then into the quote request — they are not availability filters,
 * because the directory has no availability data to filter on.
 */
export function SearchPanel({ compact = false, initial = "", initialLocation = "", initialDate = "", initialKids = "" }: {
  compact?: boolean;
  initial?: string;
  initialLocation?: string;
  initialDate?: string;
  initialKids?: string;
}) {
  const [query, setQuery] = useState(initial);
  const [location, setLocation] = useState(initialLocation);
  const [date, setDate] = useState(initialDate);
  const [kids, setKids] = useState(initialKids);
  const [suggestions, setSuggestions] = useState<City[]>([]);
  const [queryOpen, setQueryOpen] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const queryId = compact ? "compact-query" : "hero-query";
  const locationId = compact ? "compact-location" : "hero-location";

  useEffect(() => {
    setQuery(initial);
    setLocation(initialLocation);
    setDate(initialDate);
    setKids(initialKids);
  }, [initial, initialLocation, initialDate, initialKids]);

  useEffect(() => {
    void fetchCategories().then(setCategories);
  }, []);

  useEffect(() => {
    const term = location.trim();
    if (term.length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void fetchCitySuggestions(term).then((rows) => {
        if (!cancelled) setSuggestions(rows);
      });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [location]);

  const querySuggestions = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (term.length < 1) return categories.slice(0, 8);
    return categories.filter((category) =>
      category.name.toLowerCase().includes(term) ||
      category.slug.replaceAll("-", " ").includes(term) ||
      category.subcategories.some((item) => item.toLowerCase().includes(term)),
    ).slice(0, 8);
  }, [categories, query]);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const matchedCategory = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return undefined;
    return categories.find((category) =>
      category.name.toLowerCase() === term ||
      category.slug.replaceAll("-", " ") === term ||
      category.slug === term,
    );
  }, [categories, query]);

  return <form
    onSubmit={(event) => {
      event.preventDefault();
      const params = new URLSearchParams({ location });
      if (matchedCategory) params.set("category", matchedCategory.slug);
      else if (query.trim()) params.set("q", query.trim());
      if (date) params.set("date", date);
      if (kids) params.set("kids", kids);
      window.location.assign(`/search?${params.toString()}`);
    }}
    className={cn("search-shell", compact && "search-shell-compact")}>
    <div className="search-field relative sm:col-span-2">
      <label htmlFor={queryId}>What are you looking for?</label>
      <div>
        <Search />
        <Input
          id={queryId}
          value={query}
          autoComplete="off"
          placeholder="Superhero, princess, magician..."
          onChange={(event) => { setQuery(event.target.value); setQueryOpen(true); }}
          onFocus={() => setQueryOpen(true)}
          onBlur={() => window.setTimeout(() => setQueryOpen(false), 120)}
        />
      </div>
      {queryOpen && querySuggestions.length > 0 && (
        <ul className="search-suggest" role="listbox">
          {querySuggestions.map((category) => (
            <li key={category.slug}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => { setQuery(category.name); setQueryOpen(false); }}
              >
                <span>{category.name}</span>
                <span>{category.count} businesses</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
    <div className="search-field relative">
      <label htmlFor={locationId}>Where?</label>
      <div>
        <MapPin />
        <Input
          id={locationId}
          value={location}
          autoComplete="off"
          placeholder="City or state"
          onChange={(event) => { setLocation(event.target.value); setCityOpen(true); }}
          onFocus={() => setCityOpen(true)}
          onBlur={() => window.setTimeout(() => setCityOpen(false), 120)}
        />
      </div>
      {cityOpen && suggestions.length > 0 && (
        <ul className="search-suggest" role="listbox">
          {suggestions.map((city) => (
            <li key={`${city.name}-${city.stateCode}`}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => { setLocation(city.label); setCityOpen(false); }}
              >
                <span>{city.label}</span>
                <span>{city.count} businesses</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
    {!compact && <>
      <div className="search-field"><label htmlFor="party-date">When?</label><div><CalendarDays /><Input id="party-date" type="date" min={today} value={date} onChange={(event) => setDate(event.target.value < today ? "" : event.target.value)} /></div></div>
      <div className="search-field"><label htmlFor="party-kids">Kids</label><div><Users /><Input id="party-kids" type="number" min="1" value={kids} onChange={(event) => setKids(event.target.value)} placeholder="How many?" /></div></div>
    </>}
    <Button type="submit" size="lg" className={cn("h-14", compact ? "sm:h-12" : "sm:h-[4.5rem]")}><Search />{compact ? "Search" : "Find party entertainment"}</Button>
    {!compact && (date || kids) && <p className="col-span-full pt-1 text-xs text-muted-foreground">We will carry {date ? `the ${date} date` : "your date"}{kids ? ` and ${kids} children` : ""} through to your quote request.</p>}
  </form>;
}

export function Rating({ value, reviews }: { value: number; reviews: number }) {
  return <span className="inline-flex items-center gap-1 text-sm"><Star className="size-4 fill-rating text-rating" /><b>{value}</b><span className="text-muted-foreground">({reviews})</span></span>;
}

export function FavoriteButton({ id, name }: { id: number; name: string }) {
  const { isSaved, toggleSaved } = useSaved();
  const saved = isSaved(id);
  return <Button variant="surface" size="icon" className="absolute right-3 top-3 z-10 rounded-full" onClick={() => void toggleSaved(id)} aria-label={`${saved ? "Remove" : "Save"} ${name}`} aria-pressed={saved}><Heart className={cn(saved && "fill-favorite text-favorite")} /></Button>;
}

function categorySlugs(value: string) {
  return value.split(",").map((slug) => slug.trim()).filter(Boolean);
}

function toggleCategorySlug(current: string, slug: string) {
  const next = new Set(categorySlugs(current));
  if (next.has(slug)) next.delete(slug);
  else next.add(slug);
  return [...next].join(",");
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "?";
}

/**
 * The business's own site icon, falling back to its initials when the site has
 * no favicon (or when the hotlinked image fails to load in the browser).
 * Decorative: the business name always sits next to it.
 */
export function VendorLogo({ vendor, className }: { vendor: Vendor; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (vendor.logo && !broken) {
    return <img src={vendor.logo} alt="" loading="lazy" width={44} height={44} onError={() => setBroken(true)} className={cn("size-11 shrink-0 rounded-xl border border-border bg-background object-contain p-1", className)} />;
  }
  return <span aria-hidden className={cn("grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-primary-soft font-display text-sm font-extrabold text-primary", className)}>{initials(vendor.name)}</span>;
}

export function VendorCard({ vendor, compact = false, active, showCompare = false }: { vendor: Vendor; compact?: boolean; active?: boolean; showCompare?: boolean }) {
  const [quoteOpen, setQuoteOpen] = useState(false);
  const { isComparing, toggleCompare } = useSaved();
  return <article className={cn("vendor-card group", compact && "vendor-card-compact", active && "ring-2 ring-primary")}>
    <div className="relative overflow-hidden"><img src={vendor.image} alt="" loading="lazy" width={700} height={460} className="vendor-image" /><FavoriteButton id={vendor.id} name={vendor.name} />{vendor.featured && <span className="absolute left-3 top-3 rounded-full bg-foreground/80 px-2.5 py-1 text-xs font-bold text-background backdrop-blur">Featured</span>}</div>
    <div className="flex min-w-0 flex-1 flex-col p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 gap-3"><VendorLogo vendor={vendor} className={compact ? "size-9 rounded-lg" : ""} /><div className="min-w-0"><Link to="/vendors/$slug" params={{ slug: vendor.slug }} className="font-display text-lg font-extrabold hover:text-primary">{vendor.name}</Link><div className="mt-1 flex flex-wrap items-center gap-2">{vendor.rating > 0 && <Rating value={vendor.rating} reviews={vendor.reviews} />}{vendor.website && <span className="inline-flex items-center gap-1 text-xs font-bold text-trust"><BadgeCheck className="size-4" />Website</span>}</div></div></div>{vendor.price > 0 && <div className="text-right"><b className="text-lg">${vendor.price}</b><p className="text-xs text-muted-foreground">starting</p></div>}</div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground"><span>{vendor.category}</span>{vendor.location && <><span>•</span><span>{vendor.location}</span></>}{vendor.phone && <><span>•</span><span>{vendor.phone}</span></>}</div>
      <div className="vendor-details"><p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">{vendor.description}</p></div>
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">{showCompare && <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold"><Checkbox checked={isComparing(vendor.id)} onCheckedChange={() => toggleCompare(vendor.id)} />Compare</label>}<QuoteDialog vendor={vendor} open={quoteOpen} onOpenChange={setQuoteOpen} /><Button size="sm" onClick={() => setQuoteOpen(true)}>Request quote</Button></div>
    </div>
  </article>;
}

export function TrustBadge({ icon: Icon = ShieldCheck, children }: { icon?: typeof ShieldCheck; children: ReactNode }) {
  return <span className="inline-flex items-center gap-2 rounded-full border border-trust/20 bg-trust-soft px-3 py-2 text-sm font-bold text-trust"><Icon className="size-4" />{children}</span>;
}

/**
 * Filters that map to data the directory actually has: category, city, rating
 * and a starting-price range. The price controls only appear once businesses
 * publish prices, so the UI never offers a filter that cannot match anything.
 */
export function FilterPanel({ mobile = false, state, onChange, summary }: {
  mobile?: boolean;
  state: SearchState;
  onChange: (next: Partial<SearchState>) => void;
  summary: DirectorySummary | null;
}) {
  const [categories, setCategories] = useState<Category[]>([]);
  useEffect(() => { void fetchCategories().then(setCategories); }, []);
  const pricesAvailable = (summary?.pricedListings ?? 0) > 0;
  const activeCount = [state.category, state.location, state.priceMin, state.priceMax, state.ratingMin].filter(Boolean).length;

  return <div className={cn("space-y-6", mobile && "pb-24")}>
    <div className="flex items-center justify-between">
      <h2 className="font-display text-lg font-extrabold">Filters{activeCount ? ` (${activeCount})` : ""}</h2>
      {activeCount > 0 && <Button variant="ghost" size="sm" onClick={() => onChange({ category: "", location: "", priceMin: null, priceMax: null, ratingMin: null, sort: "relevance", page: 1 })}>Clear</Button>}
    </div>

    <fieldset>
      <legend className="mb-3 text-sm font-bold">Category</legend>
      <div className="space-y-2.5">
        <label className="flex cursor-pointer items-center gap-3 text-sm">
          <Checkbox checked={!state.category} onCheckedChange={(checked) => { if (checked) onChange({ category: "", page: 1 }); }} />
          All categories
        </label>
        {categories.map((option) => {
          const selected = categorySlugs(state.category).includes(option.slug);
          return (
            <label key={option.slug} className="flex cursor-pointer items-center gap-3 text-sm">
              <Checkbox
                checked={selected}
                onCheckedChange={() => onChange({ category: toggleCategorySlug(state.category, option.slug), page: 1 })}
              />
              {option.name} <span className="text-muted-foreground">({option.count})</span>
            </label>
          );
        })}
      </div>
    </fieldset>

    <fieldset>
      <legend className="mb-3 text-sm font-bold">Rating</legend>
      <label className="flex cursor-pointer items-center gap-3 text-sm">
        <Checkbox checked={state.ratingMin === 4.5} onCheckedChange={(checked) => onChange({ ratingMin: checked ? 4.5 : null, page: 1 })} />
        Only 4.5 stars and up
      </label>
    </fieldset>

    {pricesAvailable ? (
      <fieldset>
        <legend className="mb-3 text-sm font-bold">Starting price</legend>
        <p className="mb-3 text-xs text-muted-foreground">{summary?.pricedListings} of {summary?.listings} businesses publish a price.</p>
        <div className="flex items-center gap-2">
          <Input inputMode="numeric" aria-label="Minimum price" placeholder="Min" value={state.priceMin ?? ""} onChange={(event) => onChange({ priceMin: event.target.value === "" ? null : Number(event.target.value), page: 1 })} />
          <span className="text-muted-foreground">–</span>
          <Input inputMode="numeric" aria-label="Maximum price" placeholder="Max" value={state.priceMax ?? ""} onChange={(event) => onChange({ priceMax: event.target.value === "" ? null : Number(event.target.value), page: 1 })} />
        </div>
      </fieldset>
    ) : (
      <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
        No business in the directory has published a starting price yet, so there is nothing to
        filter by. Ask for quotes instead — businesses reply with their own pricing.
      </p>
    )}

    <fieldset>
      <legend className="mb-3 text-sm font-bold">City or state</legend>
      <Input value={state.location} onChange={(event) => onChange({ location: event.target.value, page: 1 })} placeholder="Dallas or TX" aria-label="City or state" />
    </fieldset>
  </div>;
}

/** Real aggregation of the current results by city — no invented map positions. */
function CityBreakdown({ items, onPick }: { items: Vendor[]; onPick: (city: string) => void }) {
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const vendor of items) {
      const key = vendor.location || "Location not listed";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [items]);

  if (counts.length === 0) return null;
  return <div className="rounded-lg border bg-background p-5">
    <h2 className="font-display text-lg font-extrabold">Where these results are</h2>
    <p className="mt-1 text-xs text-muted-foreground">Counted from the {items.length} businesses shown on this page.</p>
    <ul className="mt-4 space-y-2">
      {counts.map(([city, count]) => <li key={city}>
        {city === "Location not listed"
          ? <span className="flex items-center justify-between text-sm text-muted-foreground"><span>{city}</span><span>{count}</span></span>
          : <button type="button" onClick={() => onPick((city.split(",")[0] ?? city).trim())} className="flex w-full items-center justify-between text-left text-sm hover:text-primary"><span>{city}</span><span className="text-muted-foreground">{count}</span></button>}
      </li>)}
    </ul>
  </div>;
}

export function SearchResults({ title = "Find businesses", state, onChange, category, location }: {
  title?: string;
  /** Supplied by /search. Category and city landing pages leave it out. */
  state?: SearchState;
  onChange?: (next: Partial<SearchState>) => void;
  category?: string;
  location?: string;
}) {
  // A page that does not own the URL (a category or city landing page) keeps its
  // own filter state instead, initialised from the props it was given.
  const [local, setLocal] = useState<SearchState>({
    ...EMPTY_SEARCH,
    ...(category ? { category } : {}),
    ...(location ? { location } : {}),
  });
  const active = state ?? local;
  const update = (next: Partial<SearchState>) => {
    onChange?.(next);
    if (!state) setLocal((current) => ({ ...current, ...next }));
  };

  const [shown, setShown] = useState<Vendor[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<DirectorySummary | null>(null);
  const listRef = useRef<HTMLElement | null>(null);
  const { compareIds, clearCompare } = useSaved();

  useEffect(() => { void fetchDirectorySummary().then(setSummary); }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchListings({
      q: active.q, location: active.location, category: active.category,
      priceMin: active.priceMin ?? undefined, priceMax: active.priceMax ?? undefined,
      ratingMin: active.ratingMin ?? undefined, sort: active.sort,
      page: active.page, pageSize: 24,
    }).then((data) => {
      if (cancelled) return;
      setShown(data.items);
      setTotal(data.total);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [active.q, active.location, active.category, active.priceMin, active.priceMax, active.ratingMin, active.sort, active.page]);

  const pages = Math.max(1, Math.ceil(total / 24));
  const activeFilters = [active.category, active.location, active.priceMin, active.priceMax, active.ratingMin].filter(Boolean).length;

  return <main className="min-h-screen bg-surface pb-24">
    <div className="border-b bg-background/95 px-4 py-3 lg:sticky lg:top-0 lg:z-30 lg:backdrop-blur-xl">
      <div className="mx-auto max-w-7xl"><SearchPanel compact initial={active.q} initialLocation={active.location} initialDate={active.date} initialKids={active.kids} /></div>
    </div>
    <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-primary">Live directory</p>
          <h1 className="font-display text-3xl font-extrabold">{title}</h1>
          <p className="mt-1 text-muted-foreground" aria-live="polite">
            {loading ? "Searching the directory…" : `${total} ${total === 1 ? "business" : "businesses"} match`}
            {active.location ? ` in ${active.location}` : ""}{active.q ? ` for “${active.q}”` : ""}
            {activeFilters > 0 ? ` · ${activeFilters} filter${activeFilters === 1 ? "" : "s"}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Sheet>
            <SheetTrigger asChild><Button variant="outline" className="lg:hidden"><Filter />Filters</Button></SheetTrigger>
            <SheetContent side="bottom" className="h-[92vh] overflow-y-auto rounded-t-2xl">
              <SheetHeader><SheetTitle>Refine your party</SheetTitle><SheetDescription>Every filter here maps to data the directory holds.</SheetDescription></SheetHeader>
              <div className="mt-6"><FilterPanel mobile state={active} onChange={update} summary={summary} /></div>
            </SheetContent>
          </Sheet>
          <Select value={active.sort} onValueChange={(value) => update({ sort: value as SortKey, page: 1 })}>
            <SelectTrigger className="w-[190px]" aria-label="Sort results"><SlidersHorizontal /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="relevance">Best match</SelectItem>
              <SelectItem value="rating">Highest rated</SelectItem>
              <SelectItem value="name">A–Z</SelectItem>
              <SelectItem value="newest">Newest listings</SelectItem>
              <SelectItem value="price_asc" disabled={(summary?.pricedListings ?? 0) === 0}>Price: low to high</SelectItem>
              <SelectItem value="price_desc" disabled={(summary?.pricedListings ?? 0) === 0}>Price: high to low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {(active.date || active.kids) && <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border border-primary/25 bg-primary-soft p-4 text-sm">
        <Building2 className="size-4 text-primary" />
        <span>
          Planning for {active.date ? active.date : "a date you have not set"}
          {active.kids ? ` with ${active.kids} children` : ""}. The directory does not track availability —
          send one quote request and businesses reply with what they can do.
        </span>
        <Button size="sm" asChild><Link to="/request-quote" search={{ city: active.location, date: active.date, kids: active.kids, category: active.category }}>Request quotes</Link></Button>
      </div>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="hidden self-start space-y-6 lg:block">
          <div className="rounded-lg border bg-background p-5"><FilterPanel state={active} onChange={update} summary={summary} /></div>
          <CityBreakdown items={shown} onPick={(city) => update({ location: city, page: 1 })} />
        </aside>
        <section ref={listRef} className="space-y-4" aria-label="Search results">
          {loading && shown.length === 0 ? (
            <p className="rounded-lg border bg-background p-8 text-muted-foreground">Searching…</p>
          ) : shown.length === 0 ? (
            <div className="rounded-lg border bg-background p-8">
              <p className="font-semibold">No businesses match these filters.</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Try removing a filter, or send a quote request — we will pass it to entertainers who cover your city.
              </p>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => update({ ...EMPTY_SEARCH, q: active.q })}>Clear filters</Button>
                <Button size="sm" asChild><Link to="/request-quote" search={{ city: active.location, date: active.date, kids: active.kids, category: active.category }}>Request quotes instead</Link></Button>
              </div>
            </div>
          ) : shown.map((vendor) => <VendorCard key={vendor.id} vendor={vendor} showCompare />)}
          {pages > 1 && <div className="flex items-center justify-center gap-3 pt-4">
            <Button variant="outline" disabled={active.page <= 1} onClick={() => update({ page: active.page - 1 })}>Previous</Button>
            <span className="text-sm text-muted-foreground">Page {active.page} of {pages}</span>
            <Button variant="outline" disabled={active.page >= pages} onClick={() => update({ page: active.page + 1 })}>Next</Button>
          </div>}
        </section>
      </div>
    </div>
    {compareIds.length > 0 && <div className="fixed inset-x-4 bottom-20 z-40 mx-auto flex max-w-xl items-center gap-3 rounded-lg bg-foreground p-3 text-background shadow-2xl md:bottom-5">
      <span className="mr-auto text-sm font-bold">{compareIds.length} selected</span>
      <Button variant="secondary" size="sm" asChild><Link to="/compare">Compare now</Link></Button>
      <Button variant="ghost" size="icon" onClick={clearCompare} aria-label="Clear comparison"><X /></Button>
    </div>}
  </main>;
}

export function SessionNotice() {
  const { user, loading } = useSession();
  if (loading || user) return null;
  return <p className="rounded-lg border bg-background p-3 text-sm text-muted-foreground">
    <Link to="/login" className="font-semibold text-primary underline">Log in</Link> to keep your saved
    businesses and quote requests in one place. Everything works without an account too.
  </p>;
}
