import { createFileRoute } from "@tanstack/react-router";
import { VendorDashboardPage } from "@/components/marketplace/vendor-pages";

export const Route = createFileRoute("/vendor/dashboard")({
  head: () => ({
    meta: [
      { title: "Vendor Dashboard — PartySprout" },
      {
        name: "description",
        content: "Manage your PartySprout listing, track its review status and read incoming quote requests.",
      },
      { property: "og:title", content: "Vendor Dashboard" },
      { property: "og:description", content: "Grow your children's party business." },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VendorDashboardPage,
});
