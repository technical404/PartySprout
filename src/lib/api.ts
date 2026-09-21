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
    return { ok: false, status: 0, message: "We could not reach the server. Check your connection.", fields: undefined };
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
    request<{ listing: { id: number; name: string; status: string } }>(`/api/vendor/listings/${id}`, {
      method: "PATCH",
      ...jsonInit,
      body: JSON.stringify(body),
    }),

  adminStats: () =>
    request<{ stats: Record<string, number>; byStatus: Array<{ status: string; total: number }> }>("/api/admin/stats"),

  adminSubmissions: (status = "pending") =>
    request<{ items: OwnedListing[] }>(`/api/admin/submissions?status=${encodeURIComponent(status)}`),

  adminQuotes: () => request<{ items: QuoteRequestRow[] }>("/api/admin/quotes"),

  reviewListing: (id: number, status: "active" | "rejected" | "pending", note = "") =>
    request<{ listing: { id: number; name: string; status: string } }>(`/api/admin/listings/${id}/status`, {
      method: "POST",
      ...jsonInit,
      body: JSON.stringify({ status, note }),
    }),
};
