import { createFileRoute } from "@tanstack/react-router";
import { SavedPage } from "@/components/marketplace/account-pages";

export const Route = createFileRoute("/favorites")({
  head: () => ({
    meta: [
      { title: "Saved Entertainers — PartySprout" },
      { name: "description", content: "The children's party businesses you shortlisted, kept in one list." },
      { property: "og:title", content: "Saved Entertainers" },
      { property: "og:description", content: "Your shortlisted party businesses in one place." },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/favorites" }],
  }),
  component: SavedPage,
});
