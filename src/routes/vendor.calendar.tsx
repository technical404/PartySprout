import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { NotBuiltYet } from "@/components/marketplace/account-pages";

export const Route = createFileRoute("/vendor/calendar")({
  head: () => ({
    meta: [
      { title: "Vendor Calendar — PartySprout" },
      { name: "description", content: "Party availability and booking calendar." },
      { property: "og:title", content: "Vendor Calendar" },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <NotBuiltYet
    title="There is no availability calendar yet"
    what="Parents send a date with their quote request, and it arrives in your dashboard with their contact details. PartySprout does not yet store which dates you are free, so no calendar is shown instead of an empty grid."
    instead={<>
      <Button variant="outline" asChild><Link to="/vendor/dashboard">See the dates parents sent</Link></Button>
      <Button variant="ghost" asChild><Link to="/vendor/profile">Edit my listing</Link></Button>
    </>}
  />,
});
