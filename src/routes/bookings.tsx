import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { NotBuiltYet } from "@/components/marketplace/account-pages";

export const Route = createFileRoute("/bookings")({
  head: () => ({
    meta: [
      { title: "Party Bookings — PartySprout" },
      { name: "description", content: "Confirmed children's party entertainment bookings." },
      { property: "og:title", content: "Party Bookings" },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <NotBuiltYet
    title="PartySprout does not take bookings"
    what="Booking and payment happen directly between you and the business — PartySprout is a directory and a quote-request tool. Your requests and the businesses you shortlisted are real and are kept in your account."
    instead={<>
      <Button variant="outline" asChild><Link to="/quotes">My quote requests</Link></Button>
      <Button variant="ghost" asChild><Link to="/favorites">Saved businesses</Link></Button>
    </>}
  />,
});
