import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SearchResults } from "@/components/marketplace/marketplace";
import { EMPTY_SEARCH, searchStateFromParams, searchStateToParams } from "@/lib/marketplace-data";

export const Route = createFileRoute("/search")({
  validateSearch: searchStateFromParams,
  head: () => ({
    meta: [
      { title: "Find businesses — Hire Party Characters" },
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
        search: searchStateToParams({ ...EMPTY_SEARCH, ...search, ...next }),
      })}
    />
  );
}
