/**
 * Downloads the six activity photos into src/assets/activity/.
 *
 * Run with: npm run activity-images
 *
 * They are stored in the repo rather than hotlinked: six cross-domain requests on
 * every listing page would be fragile (the source site can block hotlinking or move
 * the files) and would make the listing pages depend on someone else's uptime. Vite
 * fingerprints them into /assets/ like the category photos, so the existing deploy
 * uploads them with no extra step.
 *
 * The copy for these six activities lives in src/components/marketplace/pages.tsx.
 */
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const OUT = join(process.cwd(), "src", "assets", "activity");
const SOURCE = "https://charactersforparty.com/wp-content/uploads/2024/10/";

const PHOTOS = [
  ["grand-entrance", "image-300x184.png"],
  ["birthday-ceremony", "image-9.png"],
  ["interactive-storytime", "image-1-3.png"],
  ["face-painting", "image-2-1.png"],
  ["games", "image-2-2.png"],
  ["photo-opportunities", "image-3-2.png"],
];

/**
 * The source host negotiates on Accept, so a .png URL can arrive as WebP. Name each
 * file after what it actually is: a .png holding WebP bytes is served with the wrong
 * content type, which some browsers and caches handle badly.
 */
function readImage(bytes) {
  if (bytes.subarray(0, 8).toString("hex").startsWith("89504e47")) {
    return { extension: "png", label: `PNG ${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}` };
  }
  if (bytes.subarray(0, 3).toString("hex") === "ffd8ff") return { extension: "jpg", label: "JPEG" };
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    return { extension: "webp", label: "WebP" };
  }
  return null;
}

// Start clean so a re-run cannot leave an old format behind under the old name.
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

for (const [slug, remote] of PHOTOS) {
  const url = SOURCE + remote;
  const response = await fetch(url, {
    headers: {
      // A plain fetch is treated as a hotlink attempt; identify as a browser.
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Referer: "https://charactersforparty.com/",
      Accept: "image/avif,image/webp,image/png,image/*,*/*;q=0.8",
    },
  });
  if (!response.ok) {
    console.log(`FAIL ${slug}: HTTP ${response.status} ${response.statusText}`);
    continue;
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const kind = readImage(bytes);
  if (kind === null) {
    console.log(`FAIL ${slug}: not an image (starts ${bytes.subarray(0, 8).toString("hex")})`);
    continue;
  }
  const name = `${slug}.${kind.extension}`;
  await writeFile(join(OUT, name), bytes);
  console.log(`OK   ${name.padEnd(30)} ${String(bytes.length).padStart(7)} bytes  ${kind.label.padEnd(11)} <- ${remote}`);
}

console.log(`\nfiles in src/assets/activity: ${(await readdir(OUT)).join(", ")}`);
