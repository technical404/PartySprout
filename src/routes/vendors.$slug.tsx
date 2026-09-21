import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { VendorProfilePage } from "@/components/marketplace/pages";
import { fetchVendor, type Vendor } from "@/lib/marketplace-data";

export const Route = createFileRoute("/vendors/$slug")({
  head: ({ params }) => ({
    meta: [{ title: `${params.slug} — PartySprout` }],
    links: [{ rel: "canonical", href: `/vendors/${params.slug}` }],
  }),
  component: Page,
});

function Page() {
  const { slug } = Route.useParams();
  const [vendor, setVendor] = useState<Vendor | null>(null);
  useEffect(() => {
    void fetchVendor(slug).then(setVendor);
  }, [slug]);
  if (!vendor) return <main className="p-10 text-muted-foreground">Loading business…</main>;
  return <VendorProfilePage vendor={vendor} />;
}
