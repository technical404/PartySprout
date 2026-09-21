import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { NotBuiltYet } from "@/components/marketplace/account-pages";

export const Route = createFileRoute("/messages")({
  head: () => ({
    meta: [
      { title: "Messages — PartySprout" },
      { name: "description", content: "Chat with children's party entertainers about your celebration." },
      { property: "og:title", content: "Party Messages" },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <NotBuiltYet
    title="PartySprout has no in-app messaging"
    what="The quote request carries your party details to the business and they reply to your email or phone, so conversations happen in the place you already check. This page previously listed random businesses as if they were your conversations."
    instead={<>
      <Button variant="outline" asChild><Link to="/quotes">My quote requests</Link></Button>
      <Button variant="ghost" asChild><Link to="/request-quote">Send a new request</Link></Button>
    </>}
  />,
});
