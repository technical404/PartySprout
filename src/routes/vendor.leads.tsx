import { createFileRoute } from "@tanstack/react-router";
import { VendorDashboardPage } from "@/components/marketplace/vendor-pages";

export const Route = createFileRoute("/vendor/leads")({
  head: () => ({
    meta: [
      { title: "Vendor Leads — PartySprout" },
      { name: "description", content: "The quote requests parents sent to your party business." },
      { property: "og:title", content: "Vendor Leads" },
      { property: "og:description", content: "Manage the inquiries your listing brings in." },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <VendorDashboardPage focus="leads" />,
});
