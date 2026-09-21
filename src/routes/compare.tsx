import { createFileRoute } from "@tanstack/react-router";
import { ComparePage } from "@/components/marketplace/account-pages";

export const Route = createFileRoute("/compare")({
  head: () => ({
    meta: [
      { title: "Compare Entertainers — PartySprout" },
      {
        name: "description",
        content:
          "Compare party businesses side by side on category, city, rating, published price and contact details.",
      },
      { property: "og:title", content: "Compare Party Entertainers" },
      { property: "og:description", content: "Choose the right entertainer with a clear side-by-side comparison." },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/compare" }],
  }),
  component: ComparePage,
});
