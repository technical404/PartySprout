import { createFileRoute } from "@tanstack/react-router";
import { SearchResults } from "@/components/marketplace/marketplace";
import { categoryLabel } from "@/lib/labels";

export const Route = createFileRoute("/category/$slug")({
  head: ({ params }) => {
    // A slug is the URL; the page and its metadata use the label.
    const name = categoryLabel(params.slug);
    return {
      meta: [
        { title: `${name} for Kids' Parties — Hire Party Characters` },
        {
          name: "description",
          content: `Compare trusted ${name} entertainers, prices, reviews and availability near you.`,
        },
        { property: "og:title", content: `Find ${name} for children's parties` },
        {
          property: "og:description",
          content: `Compare trusted local ${name} and request free quotes.`,
        },
        { property: "og:type", content: "website" },
        { property: "og:url", content: `/category/${params.slug}` },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: `/category/${params.slug}` }],
    };
  },
  component: CategoryPage,
});

function CategoryPage() {
  const { slug } = Route.useParams();
  return <SearchResults title={categoryLabel(slug)} category={slug} />;
}
