import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPage } from "@/components/marketplace/static-pages";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy policy — PartySprout" },
      {
        name: "description",
        content:
          "What PartySprout collects when you browse or send a quote request, why, and who sees it.",
      },
      { property: "og:title", content: "Privacy policy" },
      { property: "og:description", content: "How PartySprout handles your information." },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "/privacy" }],
  }),
  component: PrivacyPage,
});
