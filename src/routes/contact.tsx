import { createFileRoute } from "@tanstack/react-router";
import { ContactPage } from "@/components/marketplace/static-pages";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact us — PartySprout" },
      {
        name: "description",
        content:
          "Get in touch with PartySprout about the directory, a listing correction, or listing your party business.",
      },
      { property: "og:title", content: "Contact PartySprout" },
      { property: "og:description", content: "Reach the PartySprout team." },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "/contact" }],
  }),
  component: ContactPage,
});
