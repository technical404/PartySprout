import { createFileRoute } from "@tanstack/react-router";
import { ListBusinessPage } from "@/components/marketplace/vendor-pages";

export const Route = createFileRoute("/list-your-business")({
  head: () => ({
    meta: [
      { title: "List your business — PartySprout" },
      {
        name: "description",
        content:
          "Add your children's party business to the PartySprout directory. Free to list, reviewed by a person, and you reply to parents directly.",
      },
      { property: "og:title", content: "List your party business" },
      { property: "og:description", content: "Get found by local families planning parties." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/list-your-business" }],
  }),
  component: ListBusinessPage,
});
