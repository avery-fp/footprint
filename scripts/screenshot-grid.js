#!/usr/bin/env node
/**
 * Screenshot the footprint grid for outreach emails.
 *
 * Usage:
 *   node scripts/screenshot-grid.js
 *   node scripts/screenshot-grid.js --url https://www.footprint.onl/ae
 */

const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC_OUT = path.join(ROOT, "public", "grid-hero.png");
const TEMPLATE_OUT = path.join(ROOT, "templates", "grid-hero.png");

const args = process.argv.slice(2);
const urlIdx = args.indexOf("--url");
const URL = urlIdx >= 0 ? args[urlIdx + 1] : "https://www.footprint.onl/ae";

const WIDTH = 600;
const HEIGHT = 400;

async function main() {
  console.log(`Screenshotting ${URL} at ${WIDTH}x${HEIGHT}...`);

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 2 });

  await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });

  // Wait for grid tiles to render
  await page.waitForFunction(
    () => {
      const tiles = document.querySelectorAll('[class*="tile"], [class*="Tile"], [data-tile]');
      // Also check for any grid children or images that indicate content loaded
      const gridItems = document.querySelectorAll('[class*="grid"] > div, [class*="Grid"] > div');
      const images = document.querySelectorAll('img[src]');
      return (tiles.length > 0 || gridItems.length > 3) && images.length > 0;
    },
    { timeout: 15000 }
  ).catch(() => {
    console.log("Grid selector wait timed out — falling back to delay");
  });

  // Extra settle time for animations/lazy-loaded content
  await new Promise((r) => setTimeout(r, 2000));

  // Take full-page screenshot then clip to viewport
  const screenshot = await page.screenshot({
    type: "png",
    clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
  });

  // Write to public/ for web serving
  fs.mkdirSync(path.dirname(PUBLIC_OUT), { recursive: true });
  fs.writeFileSync(PUBLIC_OUT, screenshot);
  console.log(`Saved: ${PUBLIC_OUT}`);

  // Copy to templates/ for email embedding
  fs.mkdirSync(path.dirname(TEMPLATE_OUT), { recursive: true });
  fs.writeFileSync(TEMPLATE_OUT, screenshot);
  console.log(`Saved: ${TEMPLATE_OUT}`);

  const sizeKB = (screenshot.length / 1024).toFixed(1);
  console.log(`Size: ${sizeKB}KB (${WIDTH}x${HEIGHT} @2x)`);

  await browser.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error("Screenshot failed:", err.message);
  process.exit(1);
});
