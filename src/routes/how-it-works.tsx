import { createFileRoute } from "@tanstack/react-router";
import { HowItWorksPage } from "@/components/marketplace/static-pages";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: "How it works — PartySprout" },
      {
        name: "description",
        content:
          "Search, compare, request one quote and book: how hiring a children's party entertainer works on PartySprout.",
      },
      { property: "og:title", content: "How PartySprout works" },
      { property: "og:description", content: "From search to celebration, in five steps." },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "/how-it-works" }],
  }),
  component: HowItWorksPage,
});
