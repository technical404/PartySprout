/**
 * "non-mascots" -> "Non Mascots". A slug is a URL; this is the name.
 *
 * Used by the category routes for their heading and metadata, so the URL cannot leak
 * into the page as "superheroes", and by the search panel to fill the box with the
 * category that was searched before the category list has arrived.
 */
export function categoryLabel(slug: string) {
  return slug
    ? slug.replaceAll("-", " ").replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    : "";
}
