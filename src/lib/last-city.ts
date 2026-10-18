/**
 * The city the visitor was last searching from.
 *
 * A quote request opened from a business listing asks "Where is the party?" and
 * had nothing to say: the party's city is the visitor's, not the performer's, and
 * a listing page never sees the search it was reached from. Remembering the last
 * city a search ran puts it back in the form, so the listing's quote form opens
 * saying where the visitor is instead of leaving the question blank.
 *
 * Browser-local and best effort. When there is nothing remembered the field is
 * simply empty, exactly as it was before.
 */
const CITY_KEY = "ps.last-city";

export function rememberCity(city: string) {
  if (typeof window === "undefined") return;
  const value = city.trim();
  if (!value) return;
  try {
    window.localStorage.setItem(CITY_KEY, value);
  } catch {
    /* storage blocked or full: the form just starts blank */
  }
}

export function lastSearchedCity(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(CITY_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}
