import { createFileRoute } from "@tanstack/react-router";
import { ContactPage } from "@/components/marketplace/static-pages";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact us — Hire Party Characters" },
      {
        name: "description",
        content:
          "Get in touch with Hire Party Characters about the directory, a listing correction, or listing your party business.",
      },
      { property: "og:title", content: "Contact Hire Party Characters" },
      { property: "og:description", content: "Reach the Hire Party Characters team." },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "/contact" }],
  }),
  component: ContactPage,
});
