import { createFileRoute } from "@tanstack/react-router";
import { AdminPage } from "@/components/marketplace/admin-page";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — PartySprout" },
      { name: "description", content: "PartySprout marketplace administration." },
      { property: "og:title", content: "PartySprout Admin" },
      { property: "og:description", content: "Review business submissions and directory statistics." },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPage,
});
