import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SearchResults } from "@/components/marketplace/marketplace";
import { EMPTY_SEARCH, SORTS, type SearchState, type SortKey } from "@/lib/marketplace-data";

/**
 * Every filter lives in the URL, so a search is shareable, bookmarkable and the
 * back button steps through refinements. Only the parameters that are actually
 * set come back, which is why a link can pass just `q` and `location` while the
 * search page still receives a complete state object.
 */
function parseSearch(raw: Record<string, unknown>): Partial<SearchState> {
  const state: Partial<SearchState> = {};
  const text = (key: "q" | "location" | "category" | "date" | "kids") => {
    const value = raw[key];
    if (value != null) state[key] = String(value);
  };
  const number = (key: "priceMin" | "priceMax" | "ratingMin") => {
    const value = raw[key];
    if (value == null || value === "") return;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) state[key] = parsed;
  };

  text("q");
  text("location");
  text("category");
  text("date");
  text("kids");
  number("priceMin");
  number("priceMax");
  number("ratingMin");

  const sort = raw["sort"] == null ? "" : String(raw["sort"]);
  if (sort) state.sort = (SORTS as readonly string[]).includes(sort) ? (sort as SortKey) : "relevance";

  const page = Number(raw["page"]);
  if (Number.isFinite(page) && page > 1) state.page = Math.floor(page);

  return state;
}

export const Route = createFileRoute("/search")({
  validateSearch: parseSearch,
  head: () => ({
    meta: [
      { title: "Find businesses — PartySprout" },
      { name: "description", content: "Search children's party businesses by category and city." },
    ],
    links: [{ rel: "canonical", href: "/search" }],
  }),
  component: Page,
});

function Page() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  return (
    <SearchResults
      title="Find businesses"
      state={{ ...EMPTY_SEARCH, ...search }}
      onChange={(next) => void navigate({
        to: "/search",
        search: { ...EMPTY_SEARCH, ...search, ...next },
      })}
    />
  );
}
