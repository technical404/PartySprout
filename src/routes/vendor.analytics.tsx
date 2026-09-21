import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { NotBuiltYet } from "@/components/marketplace/account-pages";

export const Route = createFileRoute("/vendor/analytics")({
  head: () => ({
    meta: [
      { title: "Vendor Analytics — PartySprout" },
      { name: "description", content: "Profile reach and lead statistics for party businesses." },
      { property: "og:title", content: "Vendor Analytics" },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <NotBuiltYet
    title="Analytics is not part of PartySprout yet"
    what="Nothing here records profile views, click-throughs or conversion, so there are no honest numbers to show. Your dashboard shows the two things that are real: the review status of your listing and the quote requests it received."
    instead={<>
      <Button variant="outline" asChild><Link to="/vendor/dashboard">My business dashboard</Link></Button>
      <Button variant="ghost" asChild><Link to="/search" search={{ q: "", location: "" }}>Browse the directory</Link></Button>
    </>}
  />,
});
