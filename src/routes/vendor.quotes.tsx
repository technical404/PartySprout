import { createFileRoute } from "@tanstack/react-router";
import { VendorDashboardPage } from "@/components/marketplace/vendor-pages";

export const Route = createFileRoute("/vendor/quotes")({
  head: () => ({
    meta: [
      { title: "Vendor Quote Requests — PartySprout" },
      { name: "description", content: "Quote requests waiting for your reply." },
      { property: "og:title", content: "Vendor Quote Requests" },
      { property: "og:description", content: "Reply to parents by email or phone." },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <VendorDashboardPage focus="leads" />,
});
