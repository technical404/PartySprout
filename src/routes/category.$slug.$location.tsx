import { createFileRoute } from "@tanstack/react-router";
import { SearchResults } from "@/components/marketplace/marketplace";
import { cityFromSlug } from "@/lib/marketplace-data";

export const Route = createFileRoute("/category/$slug/$location")({
  head: ({ params }) => {
    const category = params.slug.replaceAll("-", " ");
    const location = cityFromSlug(params.location);
    return {
      meta: [
        { title: `${category} in ${location} — PartySprout` },
        {
          name: "description",
          content: `Find children's ${category} in ${location}. Compare businesses and request free quotes.`,
        },
        { property: "og:title", content: `${category} in ${location}` },
        { property: "og:description", content: `Compare local ${category} for children's parties.` },
        { property: "og:type", content: "website" },
        { property: "og:url", content: `/category/${params.slug}/${params.location}` },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: `/category/${params.slug}/${params.location}` }],
    };
  },
  component: Page,
});

function Page() {
  const { slug, location } = Route.useParams();
  const city = cityFromSlug(location);
  return <SearchResults title={`${slug.replaceAll("-", " ")} in ${city}`} category={slug} location={city} />;
}
