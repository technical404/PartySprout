import { createFileRoute } from "@tanstack/react-router";
import { VendorDashboardPage } from "@/components/marketplace/vendor-pages";

export const Route = createFileRoute("/vendor/profile")({
  head: () => ({
    meta: [
      { title: "Edit Vendor Profile — PartySprout" },
      { name: "description", content: "Update the details parents see on your PartySprout listing." },
      { property: "og:title", content: "Edit Vendor Profile" },
      { property: "og:description", content: "Keep your party entertainment listing current." },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <VendorDashboardPage focus="profile" />,
});
