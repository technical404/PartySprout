import { createFileRoute } from "@tanstack/react-router";
import { AboutPage } from "@/components/marketplace/static-pages";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About us — Hire Party Characters" },
      {
        name: "description",
        content:
          "Hire Party Characters is a directory of children's party entertainers. Learn what we do, what we don't, and how listings are chosen.",
      },
      { property: "og:title", content: "About Hire Party Characters" },
      { property: "og:description", content: "A directory of children's party entertainers." },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "/about" }],
  }),
  component: AboutPage,
});
