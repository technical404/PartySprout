import { createFileRoute } from "@tanstack/react-router";
import { QuotesPage } from "@/components/marketplace/account-pages";

export const Route = createFileRoute("/quotes")({
  head: () => ({
    meta: [
      { title: "My quote requests — PartySprout" },
      { name: "description", content: "Every quote request you sent to children's party businesses." },
      { property: "og:title", content: "My quote requests" },
      { property: "og:description", content: "Track the requests you sent and who they went to." },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: QuotesPage,
});
