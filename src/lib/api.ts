import type { ListingRow, QuoteRequestRow } from "./marketplace-data";

/** A listing row as the owner/admin endpoints return it (adds review fields). */
export type OwnedListing = ListingRow & {
  status?: string;
  review_note?: string | null;
  created_at?: string;
  email?: string | null;
};

export type ApiFailure = {
  ok: false;
  status: number;
  message: string;
  fields: Record<string, string> | undefined;
};

export type ApiResult<T> = { ok: true; data: T } | ApiFailure;

const jsonInit: RequestInit = { headers: { "content-type": "application/json" } };

/** Drops empty filters so a cleared box never sends `?q=`. */
function query(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

/** A listing row with every column the admin tables and edit form need. */
export type AdminListing = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  policies: string | null;
  website: string | null;
  icon_url: string | null;
  image_url: string | null;
  phone: string | null;
  email: string | null;
  price_from: number | null;
  rating: number | null;
  review_count: number | null;
  is_featured: number;
  pin_rank: number;
  status: string;
  review_note: string | null;
  submitted_by: number | null;
  created_at: string;
  category_id: number;
  country_id: number;
  state_id: number | null;
  city_id: number | null;
  city_text: string | null;
  category_name: string;
  category_slug: string;
  category_icon: string | null;
  city_name: string | null;
  state_code: string | null;
  country_code: string;
};

export type AdminPage<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export type AdminUser = {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  role: string;
  status: string;
  listing_id: number | null;
  created_at: string;
  listing_name?: string | null;
  listing_slug?: string | null;
};

export type AdminSubcategory = {
  id: number;
  category_id: number;
  slug: string;
  name: string;
  sort_order: number;
};

export type AdminCategory = {
  id: number;
  slug: string;
  name: string;
  tagline: string | null;
  icon: string | null;
  sort_order: number;
  is_active: number;
  listing_count: number;
  active_count: number;
  subcategories: AdminSubcategory[];
};

/** Everything the admin edit dialog can change about a business. */
export type AdminListingInput = {
  name: string;
  categorySlug: string;
  cityText: string;
  website: string;
  phone: string;
  email: string;
  priceFrom: string;
  description: string;
  policies: string;
  status: string;
  isFeatured: boolean;
  pinRank: number;
  reviewNote: string;
};

/**
 * One place that turns a fetch into either data or a message the UI can show.
 * Nothing here invents a success: a non-2xx answer is always a failure.
 */
async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, { cache: "no-store", ...init });
    const payload = (await res.json().catch(() => ({}))) as {
      error?: string;
      fields?: Record<string, string>;
    } & Partial<T>;
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        message: payload.error || `That did not work (error ${res.status}).`,
        fields: payload.fields,
      };
    }
    return { ok: true, data: payload as T };
  } catch {
    return {
      ok: false,
      status: 0,
      message: "We could not reach the server. Check your connection.",
      fields: undefined,
    };
  }
}

export type BusinessSubmission = {
  name: string;
  categorySlug: string;
  cityId?: number | null;
  cityText?: string;
  website?: string;
  email?: string;
  phone?: string;
  priceFrom?: string;
  description?: string;
};

export const api = {
  /** Businesses this account submitted, whatever their review status. */
  myListings: () => request<{ items: OwnedListing[] }>("/api/vendor/listings"),

  /** Quote requests addressed to this vendor's business. */
  myLeads: () => request<{ items: QuoteRequestRow[] }>("/api/vendor/leads"),

  /** Creates a pending submission that an admin reviews. */
  submitBusiness: (body: BusinessSubmission) =>
    request<{ listing: { id: number; name: string; status: string } }>("/api/listings", {
      method: "POST",
      ...jsonInit,
      body: JSON.stringify(body),
    }),

  updateBusiness: (id: number, body: BusinessSubmission) =>
    request<{ listing: { id: number; name: string; status: string } }>(
      `/api/vendor/listings/${id}`,
      {
        method: "PATCH",
        ...jsonInit,
        body: JSON.stringify(body),
      },
    ),

  adminStats: () =>
    request<{ stats: Record<string, number>; byStatus: Array<{ status: string; total: number }> }>(
      "/api/admin/stats",
    ),

  adminSubmissions: (status = "pending") =>
    request<{ items: OwnedListing[] }>(
      `/api/admin/submissions?status=${encodeURIComponent(status)}`,
    ),

  adminQuotes: (params: { q?: string; page?: number; pageSize?: number } = {}) =>
    request<AdminPage<QuoteRequestRow>>(`/api/admin/quotes${query(params)}`),

  reviewListing: (id: number, status: "active" | "rejected" | "pending", note = "") =>
    request<{ listing: { id: number; name: string; status: string } }>(
      `/api/admin/listings/${id}/status`,
      {
        method: "POST",
        ...jsonInit,
        body: JSON.stringify({ status, note }),
      },
    ),

  /** Every listing, whatever its status, for the management table. */
  adminListings: (
    params: {
      q?: string;
      status?: string;
      category?: string;
      featured?: string;
      sort?: string;
      page?: number;
      pageSize?: number;
    } = {},
  ) => request<AdminPage<AdminListing>>(`/api/admin/listings${query(params)}`),

  adminUpdateListing: (id: number, body: AdminListingInput) =>
    request<{ listing: AdminListing }>(`/api/admin/listings/${id}`, {
      method: "PATCH",
      ...jsonInit,
      body: JSON.stringify(body),
    }),

  adminDeleteListing: (id: number) =>
    request<{ deleted: boolean }>(`/api/admin/listings/${id}`, { method: "DELETE" }),

  adminUsers: (
    params: { q?: string; role?: string; status?: string; page?: number; pageSize?: number } = {},
  ) => request<AdminPage<AdminUser>>(`/api/admin/users${query(params)}`),

  /** Creates an account with the role the admin chose; only admins may call it. */
  adminCreateUser: (body: { email: string; name: string; phone?: string; role: string; password: string }) =>
    request<{ user: AdminUser }>("/api/admin/users", {
      method: "POST",
      ...jsonInit,
      body: JSON.stringify(body),
    }),

  adminUpdateUser: (
    id: number,
    body: { name: string; phone: string; role: string; status: string },
  ) =>
    request<{ user: AdminUser }>(`/api/admin/users/${id}`, {
      method: "PATCH",
      ...jsonInit,
      body: JSON.stringify(body),
    }),

  adminDeleteUser: (id: number) =>
    request<{ deleted: boolean }>(`/api/admin/users/${id}`, { method: "DELETE" }),

  /** Sets a new password for another account and ends its other sessions. */
  adminSetPassword: (id: number, password: string) =>
    request<{ ok: boolean }>(`/api/admin/users/${id}/password`, {
      method: "POST",
      ...jsonInit,
      body: JSON.stringify({ password }),
    }),

  adminCategories: () => request<{ items: AdminCategory[] }>("/api/admin/categories"),

  adminUpdateCategory: (id: number, body: { name: string; tagline: string; isActive: boolean }) =>
    request<{ category: AdminCategory }>(`/api/admin/categories/${id}`, {
      method: "PATCH",
      ...jsonInit,
      body: JSON.stringify(body),
    }),

  adminUpdateSubcategory: (id: number, name: string) =>
    request<{ subcategory: AdminSubcategory }>(`/api/admin/subcategories/${id}`, {
      method: "PATCH",
      ...jsonInit,
      body: JSON.stringify({ name }),
    }),

  adminDeleteQuote: (id: number) =>
    request<{ deleted: boolean }>(`/api/admin/quotes/${id}`, { method: "DELETE" }),
};
