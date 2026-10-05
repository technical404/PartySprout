import { createFileRoute } from "@tanstack/react-router";
import { AccountPage } from "@/components/marketplace/account-pages";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "My account — Hire Party Characters" },
      { name: "description", content: "Your details, shortlisted businesses and quote requests in one place." },
      { property: "og:title", content: "My account — Hire Party Characters" },
      { property: "og:description", content: "Keep every party detail organized." },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/account" }],
  }),
  component: AccountPage,
});
