import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { RequestQuotePage } from "@/components/marketplace/quote-form";

export const Route = createFileRoute("/request-quote")({
  // Every parameter stays optional so a plain <Link to="/request-quote"> does
  // not have to pass a search object. city/date/kids/category arrive from the
  // search page and prefill the form.
  validateSearch: (s) =>
    z
      .object({
        vendor: z.string().optional(),
        city: z.string().optional(),
        date: z.string().optional(),
        kids: z.string().optional(),
        category: z.string().optional(),
      })
      .parse(s),
  head: () => ({
    meta: [
      { title: "Request a party quote — PartySprout" },
      {
        name: "description",
        content:
          "Send one request and get quotes from children's party entertainers near you. No account needed.",
      },
      { property: "og:title", content: "Request a party quote" },
      {
        property: "og:description",
        content: "One form, matched to local children's entertainers.",
      },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "/request-quote" }],
  }),
  component: Page,
});

function Page() {
  const { vendor, city, date, kids, category } = Route.useSearch();
  return <RequestQuotePage vendorSlug={vendor ?? ""} prefill={{ city, date, kids, category }} />;
}
