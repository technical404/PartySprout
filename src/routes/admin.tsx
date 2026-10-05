import { createFileRoute } from "@tanstack/react-router";
import { AdminPage } from "@/components/marketplace/admin-page";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Hire Party Characters" },
      { name: "description", content: "Hire Party Characters marketplace administration." },
      { property: "og:title", content: "Hire Party Characters Admin" },
      { property: "og:description", content: "Review business submissions and directory statistics." },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPage,
});
