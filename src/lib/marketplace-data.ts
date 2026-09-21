import superheroes from "@/assets/categories/superheroes.jpg";
import princesses from "@/assets/categories/princesses.jpg";
import mascots from "@/assets/categories/mascots.jpg";
import starWars from "@/assets/categories/star-wars.jpg";
import magicians from "@/assets/categories/magicians.jpg";
import pirates from "@/assets/categories/pirates.jpg";
import fairies from "@/assets/categories/fairies.jpg";
import clowns from "@/assets/categories/clowns.jpg";
import holidays from "@/assets/categories/holidays.jpg";
import magicianParty from "@/assets/magician-party.jpg";

export type Category = {
  name: string;
  slug: string;
  description: string;
  count: number;
  image: string;
  /** Curated specialty labels shown on the back of the category flip card. */
  subcategories: string[];
};

/** A city that actually has active listings, with its listing count. */
export type City = {
  name: string;
  stateCode: string;
  count: number;
  /** "Chicago, IL" — used both for display and the search location filter. */
  label: string;
};

export type Vendor = {
  id: number;
  name: string;
  slug: string;
  category: string;
  categories: string[];
  location: string;
  rating: number;
  reviews: number;
  price: number;
  website: string | null;
  phone: string | null;
  /** The business's own site icon, or null when it has none / is unknown. */
  logo: string | null;
  image: string;
  description: string;
  featured: boolean;
};

export type ListingRow = {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  website?: string | null;
  icon_url?: string | null;
  phone?: string | null;
  price_from?: number | null;
  rating?: number | null;
  is_featured?: number;
  category_name: string;
  category_slug: string;
  city_name?: string | null;
  state_code?: string | null;
  categories?: Array<{ name: string; slug: string }>;
};

const categoryImages: Record<string, string> = {
  superheroes,
  princesses,
  mascots,
  "star-wars": starWars,
  magicians,
  pirates,
  fairy: fairies,
  fairies,
  clowns,
  holidays,
  "non-mascots": superheroes,
  "non-mascot-characters": superheroes,
};

const uiSlug: Record<string, string> = {
  fairy: "fairies",
  "non-mascots": "non-mascot-characters",
};

const live: RequestInit = { cache: "no-store" };

/** Sort keys the API accepts; anything else falls back to relevance. */
export const SORTS = ["relevance", "rating", "price_asc", "price_desc", "name", "newest"] as const;
export type SortKey = (typeof SORTS)[number];

/**
 * The search page keeps every filter in the URL, so a search is shareable and
 * the back button works. This is the shape of those parameters.
 */
export type SearchState = {
  q: string;
  location: string;
  category: string;
  priceMin: number | null;
  priceMax: number | null;
  ratingMin: number | null;
  sort: SortKey;
  date: string;
  kids: string;
  page: number;
};

export const EMPTY_SEARCH: SearchState = {
  q: "",
  location: "",
  category: "",
  priceMin: null,
  priceMax: null,
  ratingMin: null,
  sort: "relevance",
  date: "",
  kids: "",
  page: 1,
};

export function categoryImage(slug: string) {
  return categoryImages[slug] ?? magicianParty;
}

/**
 * Turns the city part of an SEO URL back into something the search filter can
 * use: "dallas-tx" becomes "Dallas", which matches the city reference table.
 */
export function cityFromSlug(slug: string): string {
  const first = slug.split("-")[0] ?? slug;
  return first.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

export function mapCategory(row: {
  slug: string;
  name: string;
  tagline?: string;
  listing_count?: number;
  subcategories?: string[];
}): Category {
  const slug = uiSlug[row.slug] ?? row.slug;
  return {
    name: row.name,
    slug,
    description: row.tagline || "",
    count: Number(row.listing_count || 0),
    image: categoryImage(row.slug),
    subcategories: row.subcategories ?? [],
  };
}

export function mapCity(row: { name: string; state_code?: string | null; listing_count?: number }): City {
  const stateCode = row.state_code || "";
  return {
    name: row.name,
    stateCode,
    count: Number(row.listing_count || 0),
    label: [row.name, stateCode].filter(Boolean).join(", "),
  };
}

/**
 * The icon URL is rendered in an <img src>, so only ever pass through absolute
 * http(s) URLs. The crawler already enforces this; re-checking keeps a manually
 * edited database from turning into a script-execution vector.
 */
function safeLogoUrl(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function mapVendor(row: ListingRow): Vendor {
  const location = [row.city_name, row.state_code].filter(Boolean).join(", ");
  const reviewsMatch = String(row.description || "").match(/(\d+)\s+Google reviews/i);
  const extraCats = (row.categories || []).map((c) => c.name).filter(Boolean);
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    category: row.category_name,
    categories: extraCats.length ? extraCats : [row.category_name],
    location,
    rating: Number(row.rating || 0),
    reviews: reviewsMatch ? Number(reviewsMatch[1]) : 0,
    price: Number(row.price_from || 0),
    website: row.website || null,
    phone: row.phone || null,
    logo: safeLogoUrl(row.icon_url),
    image: categoryImage(row.category_slug),
    description: row.description || "",
    featured: Boolean(row.is_featured),
  };
}

export function parseNaturalSearch(query: string) {
  return query.trim() ? [query.trim()] : [];
}

export async function fetchCategories(): Promise<Category[]> {
  const res = await fetch("/api/categories", live);
  if (!res.ok) return [];
  const rows = (await res.json()) as Array<{
    slug: string;
    name: string;
    tagline?: string;
    listing_count?: number;
    subcategories?: string[];
  }>;
  return rows.map(mapCategory);
}

export async function fetchCities(limit = 12): Promise<City[]> {
  const res = await fetch(`/api/cities?limit=${limit}`, live);
  if (!res.ok) return [];
  const rows = (await res.json()) as Array<{ name: string; state_code?: string | null; listing_count?: number }>;
  return rows.map(mapCity);
}

export async function fetchListings(
  params: {
    q?: string | undefined;
    location?: string | undefined;
    category?: string | undefined;
    priceMin?: number | undefined;
    priceMax?: number | undefined;
    ratingMin?: number | undefined;
    sort?: string | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
  } = {}
) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.location) search.set("location", params.location);
  if (params.category) search.set("category", params.category);
  if (params.priceMin != null) search.set("priceMin", String(params.priceMin));
  if (params.priceMax != null) search.set("priceMax", String(params.priceMax));
  if (params.ratingMin != null) search.set("ratingMin", String(params.ratingMin));
  if (params.sort) search.set("sort", params.sort);
  if (params.page) search.set("page", String(params.page));
  search.set("pageSize", String(params.pageSize ?? 24));
  const res = await fetch(`/api/listings?${search.toString()}`, live);
  if (!res.ok) return { total: 0, items: [] as Vendor[] };
  const data = (await res.json()) as { total: number; items: ListingRow[] };
  return { total: data.total, items: (data.items || []).map(mapVendor) };
}

/** Resolves saved/compared listing ids in one round trip, keeping the saved order. */
export async function fetchListingsByIds(ids: number[]): Promise<Vendor[]> {
  if (ids.length === 0) return [];
  const res = await fetch(`/api/listings/by-ids?ids=${ids.join(",")}`, live);
  if (!res.ok) return [];
  const data = (await res.json()) as { items?: ListingRow[] };
  const byId = new Map((data.items || []).map((row) => [row.id, mapVendor(row)]));
  return ids.map((id) => byId.get(id)).filter((vendor): vendor is Vendor => Boolean(vendor));
}

/** City type-ahead straight from the cities table. */
export async function fetchCitySuggestions(term: string, limit = 8): Promise<City[]> {
  const query = term.trim();
  if (query.length < 2) return [];
  const res = await fetch(`/api/cities?q=${encodeURIComponent(query)}`, live);
  if (!res.ok) return [];
  const rows = (await res.json()) as Array<{ name: string; state_code?: string | null; listing_count?: number }>;
  return rows.slice(0, limit).map(mapCity);
}

export type DirectorySummary = {
  listings: number;
  cities: number;
  categories: number;
  /** How many live listings publish a starting price. */
  pricedListings: number;
  minPrice: number | null;
  maxPrice: number | null;
};

/**
 * Honest capability numbers for the UI: the price filter is only offered when
 * businesses have actually published prices, instead of showing a dead control.
 */
export async function fetchDirectorySummary(): Promise<DirectorySummary> {
  const fallback: DirectorySummary = {
    listings: 0, cities: 0, categories: 0, pricedListings: 0, minPrice: null, maxPrice: null,
  };
  try {
    const res = await fetch("/api/directory-summary", live);
    if (!res.ok) return fallback;
    return { ...fallback, ...((await res.json()) as Partial<DirectorySummary>) };
  } catch {
    return fallback;
  }
}

export async function fetchVendor(slug: string): Promise<Vendor | null> {
  const res = await fetch(`/api/listings/${encodeURIComponent(slug)}`, live);
  if (!res.ok) return null;
  return mapVendor((await res.json()) as ListingRow);
}

export type QuoteRequestInput = {
  name: string;
  email: string;
  phone?: string;
  city?: string;
  eventDate?: string;
  guestCount?: string;
  childAge?: string;
  categorySlug?: string;
  budget?: string;
  details?: string;
  vendorSlug?: string;
};

/** A quote request as the account pages read it back from the database. */
export type QuoteRequestRow = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  city: string | null;
  event_date: string | null;
  guest_count: string | null;
  child_age: string | null;
  category_slug: string | null;
  budget: string | null;
  details: string | null;
  vendor_id: number | null;
  vendor_name: string | null;
  vendor_slug: string | null;
  created_at: string;
};

export async function fetchMyQuoteRequests(): Promise<QuoteRequestRow[]> {
  const res = await fetch("/api/quote-requests/mine", live);
  if (!res.ok) return [];
  const data = (await res.json()) as { items?: QuoteRequestRow[] };
  return data.items ?? [];
}

/** `fields` is a union rather than optional so it satisfies exactOptionalPropertyTypes. */
export type QuoteRequestResult =
  | { ok: true; id: number }
  | { ok: false; message: string; fields: Record<string, string> | undefined };

export async function submitQuoteRequest(input: QuoteRequestInput): Promise<QuoteRequestResult> {
  try {
    const res = await fetch("/api/quote-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = (await res.json().catch(() => ({}))) as {
      id?: number;
      error?: string;
      fields?: Record<string, string>;
    };
    if (!res.ok) {
      return {
        ok: false,
        message: data.error || `We could not send your request (error ${res.status}).`,
        fields: data.fields,
      };
    }
    return { ok: true, id: Number(data.id ?? 0) };
  } catch {
    return {
      ok: false,
      message: "We could not reach the server. Check your connection and try again.",
      fields: undefined,
    };
  }
}
