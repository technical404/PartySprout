import { createFileRoute } from "@tanstack/react-router";
import { LoginPage } from "@/components/marketplace/account-pages";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log in or sign up — PartySprout" },
      {
        name: "description",
        content:
          "Log in to save favourite party businesses, track quote requests, or manage a vendor listing.",
      },
      { property: "og:title", content: "Log in — PartySprout" },
      { property: "og:description", content: "One account for parents and party businesses." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/login" }],
  }),
  component: LoginPage,
});
