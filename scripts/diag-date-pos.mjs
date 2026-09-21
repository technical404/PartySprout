import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true, channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:8080", { waitUntil: "domcontentloaded" });
await page.waitForSelector("#party-date", { timeout: 30000 });
await page.waitForTimeout(1200);

const data = await page.evaluate(() => {
  const shell = document.querySelector(".search-shell");
  const shellBox = shell.getBoundingClientRect();

  const fields = [...shell.querySelectorAll(".search-field")].map((f) => {
    const label = f.querySelector("label");
    const wrap = f.querySelector(":scope > div");
    const svg = wrap.querySelector("svg");
    const input = wrap.querySelector("input");
    const fr = f.getBoundingClientRect();
    const lr = label.getBoundingClientRect();
    const sr = svg ? svg.getBoundingClientRect() : null;
    const ir = input.getBoundingClientRect();
    return {
      label: label.textContent,
      type: input.getAttribute("type") || "text",
      fieldLeft: Math.round(fr.left),
      fieldWidth: Math.round(fr.width),
      labelLeft: Math.round(lr.left),
      svgLeft: sr ? Math.round(sr.left) : null,
      svgWidth: sr ? Math.round(sr.width) : null,
      inputLeft: Math.round(ir.left),
      inputWidth: Math.round(ir.width),
      // Where does the text content actually begin?
      textStart: Math.round((sr ? sr.right : ir.left) + 5.6 + 1),
      svgHTML: svg ? svg.outerHTML.slice(0, 90) : "(no svg)",
    };
  });

  return {
    shell: { left: Math.round(shellBox.left), width: Math.round(shellBox.width), right: Math.round(shellBox.right) },
    grid: getComputedStyle(shell).gridTemplateColumns,
    fields,
    dateFieldHTML: document.querySelector("#party-date")?.parentElement?.outerHTML.slice(0, 400),
  };
});

console.log("shell:", JSON.stringify(data.shell));
console.log("grid columns:", data.grid);
console.log("\nfields:");
for (const f of data.fields) {
  console.log(
    `  ${String(f.label).padEnd(24)} type=${f.type.padEnd(6)} field=[${f.fieldLeft}..${f.fieldLeft + f.fieldWidth}] labelX=${f.labelLeft} svgX=${String(f.svgLeft).padStart(5)} svgW=${String(f.svgWidth).padStart(4)} inputX=${f.inputLeft} textStarts~${f.textStart}`
  );
}
console.log("\nlast field right edge:", data.fields.at(-1).fieldLeft + data.fields.at(-1).fieldWidth);
console.log("shell right edge:      ", data.shell.right);
console.log("trailing empty space:  ", data.shell.right - (data.fields.at(-1).fieldLeft + data.fields.at(-1).fieldWidth));
console.log("\ndate field HTML:\n", data.dateFieldHTML);
for (const f of data.fields) console.log(`\nsvg for "${f.label}": ${f.svgHTML}`);

await browser.close();
