import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { NotBuiltYet } from "@/components/marketplace/account-pages";

export const Route = createFileRoute("/vendor/messages")({
  head: () => ({
    meta: [
      { title: "Vendor Messages — PartySprout" },
      { name: "description", content: "Reply to parents and party planners." },
      { property: "og:title", content: "Vendor Messages" },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <NotBuiltYet
    title="PartySprout has no in-app inbox"
    what="There is no message thread here, and no inbox to fake one in. Parents leave their email address and phone number with every quote request, so you reply to them directly — which also means nothing gets lost in a second inbox."
    instead={<>
      <Button variant="outline" asChild><Link to="/vendor/leads">Open my quote requests</Link></Button>
      <Button variant="ghost" asChild><Link to="/vendor/dashboard">My dashboard</Link></Button>
    </>}
  />,
});
