import { createFileRoute } from "@tanstack/react-router";
import { AboutPage } from "@/components/marketplace/static-pages";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About us — PartySprout" },
      {
        name: "description",
        content:
          "PartySprout is a directory of children's party entertainers. Learn what we do, what we don't, and how listings are chosen.",
      },
      { property: "og:title", content: "About PartySprout" },
      { property: "og:description", content: "A directory of children's party entertainers." },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "/about" }],
  }),
  component: AboutPage,
});
