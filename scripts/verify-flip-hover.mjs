import { chromium } from "playwright";

const BASE = "http://localhost:8080";
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const problems = [];

// ---------- Mouse device: hover should flip -------------------------------
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".flip-card", { timeout: 30000 });
await page.waitForTimeout(1500);

const card = page.locator(".flip-card").first();
const name = await card.locator(".flip-front h3").innerText();
console.log(`card under test: "${name}"`);

const state = async (label) => {
  const s = await card.evaluate((el) => {
    const inner = el.querySelector(".flip-inner");
    const back = el.querySelector(".flip-back");
    const front = el.querySelector(".flip-front");
    return {
      flipped: el.getAttribute("data-flipped"),
      transform: getComputedStyle(inner).transform,
      backPE: getComputedStyle(back).pointerEvents,
      frontPE: getComputedStyle(front).pointerEvents,
      backInert: back.hasAttribute("inert"),
    };
  });
  console.log(
    `  ${label.padEnd(22)} data-flipped=${String(s.flipped).padEnd(5)} backPE=${s.backPE.padEnd(5)} frontPE=${s.frontPE.padEnd(5)} backInert=${s.backInert}`
  );
  return s;
};

// Park the mouse far away, then confirm the card is at rest.
await page.mouse.move(10, 800);
await page.waitForTimeout(400);
const rest = await state("at rest");

// Hover the card.
await card.hover();
await page.waitForTimeout(900);
const hover = await state("on hover");

// Rotate far enough that the back is really facing us.
const rotated = hover.transform !== rest.transform;
console.log(`\ntransform changed on hover: ${rotated} (${rest.transform} -> ${hover.transform})`);
if (hover.flipped !== "true") problems.push("hover did not set data-flipped");
if (!rotated) problems.push("hover did not rotate the card");
if (hover.backPE === "none") problems.push("back face still not clickable on hover");
if (hover.backInert) problems.push("back face is inert on hover, Explore would be unclickable");

// Explore link must be reachable while hovering.
const explore = card.locator(".flip-back a").first();
const exploreVisible = await explore.isVisible();
const exploreText = await explore.innerText().catch(() => "");
console.log(`\nExplore link visible on hover: ${exploreVisible} ("${exploreText}")`);
if (!exploreVisible) problems.push("Explore link not visible on hover");

// Clicking Explore should navigate to the category page.
await explore.click();
await page.waitForTimeout(1200);
const url = new URL(page.url()).pathname;
console.log(`Explore navigated to: ${url}`);
if (!url.startsWith("/category/")) problems.push(`Explore did not navigate to a category page (got ${url})`);

// ---------- Mouse leave should un-flip ------------------------------------
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".flip-card", { timeout: 30000 });
await page.waitForTimeout(1500);
const card2 = page.locator(".flip-card").nth(1);
await card2.hover();
await page.waitForTimeout(800);
const onHover = await card2.getAttribute("data-flipped");
await page.mouse.move(10, 800);
await page.waitForTimeout(800);
const afterLeave = await card2.getAttribute("data-flipped");
console.log(`\nmouse-leave: hover=${onHover} -> after leave=${afterLeave}`);
if (onHover !== "true") problems.push("second card did not flip on hover");
if (afterLeave !== "false") problems.push("card stayed flipped after the mouse left");

// ---------- Touch device: hover must NOT fire, tap must still work ---------
const touch = await browser.newPage({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
await touch.goto(BASE, { waitUntil: "domcontentloaded" });
await touch.waitForSelector(".flip-card", { timeout: 30000 });
await touch.waitForTimeout(2000);
const tcard = touch.locator(".flip-card").first();
const beforeTap = await tcard.getAttribute("data-flipped");
await tcard.tap();
await touch.waitForTimeout(900);
const afterTap = await tcard.getAttribute("data-flipped");
console.log(`\ntouch: before tap=${beforeTap} -> after tap=${afterTap}`);
if (afterTap !== "true") problems.push("tap no longer flips on a touch device");

// Back button must still un-flip on touch.
const backBtn = tcard.locator(".flip-back button", { hasText: /^Back$/ });
if (await backBtn.count()) {
  await backBtn.first().click();
  await touch.waitForTimeout(900);
  const afterBack = await tcard.getAttribute("data-flipped");
  console.log(`touch: after Back=${afterBack}`);
  if (afterBack !== "false") problems.push("Back button does not un-flip on touch");
} else {
  problems.push("Back button missing on touch");
}

await browser.close();
console.log("\n================ RESULT ================");
if (problems.length === 0) console.log("HOVER FLIP OK");
else problems.forEach((p) => console.log("PROBLEM: " + p));
process.exit(problems.length === 0 ? 0 : 1);
