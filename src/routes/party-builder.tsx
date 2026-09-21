import { createFileRoute } from "@tanstack/react-router";
import { PartyBuilderPage } from "@/components/marketplace/account-pages";

export const Route = createFileRoute("/party-builder")({
  head: () => ({
    meta: [
      { title: "Build My Party — PartySprout" },
      {
        name: "description",
        content:
          "Pick the entertainment, city, date and party size, then shortlist real businesses and send one quote request.",
      },
      { property: "og:title", content: "Build My Party" },
      { property: "og:description", content: "Shortlist entertainers from the live directory in a minute." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/party-builder" }],
  }),
  component: PartyBuilderPage,
});
