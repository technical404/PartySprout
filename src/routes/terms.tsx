import { createFileRoute } from "@tanstack/react-router";
import { TermsPage } from "@/components/marketplace/static-pages";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of use — PartySprout" },
      {
        name: "description",
        content:
          "The terms that govern use of the PartySprout children's party entertainment directory.",
      },
      { property: "og:title", content: "Terms of use" },
      { property: "og:description", content: "Ground rules for using the PartySprout directory." },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "/terms" }],
  }),
  component: TermsPage,
});
