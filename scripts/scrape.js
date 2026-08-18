// scripts/scrape.js
// Fetches fabtcg.com/living-legend/, parses the leaderboard table(s), and
// upserts today's date into data/snapshots.json (never touching older
// entries). Run by the weekly GitHub Action, or manually via `npm run scrape`.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import * as cheerio from "cheerio";

const LL_URL = "https://fabtcg.com/living-legend/";
const DATA_PATH = new URL("../data/snapshots.json", import.meta.url);
const MAX_SNAPSHOTS = 52; // keep about a year of weekly history

// A plain fetch() from GitHub Actions runners gets a 403 — their IPs are
// datacenter ranges that fabtcg.com's anti-bot protection (Cloudflare)
// blocks outright, regardless of headers. Driving a real headless browser
// changes the network/TLS fingerprint enough to get through.
async function fetchRenderedHtml() {
  const browser = await chromium.launch({
    args: ["--disable-blink-features=AutomationControlled"],
  });
  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      locale: "en-US",
      viewport: { width: 1280, height: 900 },
    });
    // Hide the most obvious automation tell.
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });

    const page = await context.newPage();
    const response = await page.goto(LL_URL, { waitUntil: "domcontentloaded", timeout: 30000 });

    if (!response || !response.ok()) {
      const status = response ? response.status() : "no response";
      throw new Error(`Navigation failed: HTTP ${status}`);
    }

    // Give any client-side rendering a moment; don't hard-fail if the
    // selector never appears, parseLeaderboard() will just find nothing
    // and we'll log a preview for debugging.
    await page.waitForSelector("table", { timeout: 15000 }).catch(() => {});

    return await page.content();
  } finally {
    await browser.close();
  }
}

function parseLeaderboard(html) {
  const $ = cheerio.load(html);
  const heroes = {};

  $("table").each((_, table) => {
    const $table = $(table);
    const $headerRow = $table.find("thead tr").first().length
      ? $table.find("thead tr").first()
      : $table.find("tr").first();

    const headerCells = $headerRow
      .find("th, td")
      .map((_, el) => $(el).text().trim().toLowerCase())
      .get();

    const heroIdx = headerCells.findIndex((h) => h.includes("hero"));
    const pointsIdx = headerCells.findIndex((h) => h.includes("living legend points"));
    if (heroIdx === -1 || pointsIdx === -1) return; // not a relevant table

    const $rows = $table.find("tbody tr").length ? $table.find("tbody tr") : $table.find("tr");

    $rows.each((_, row) => {
      if (row === $headerRow.get(0)) return;
      const cells = $(row)
        .find("td")
        .map((_, td) => $(td).text().trim())
        .get();
      if (cells.length <= Math.max(heroIdx, pointsIdx)) return;

      const name = cells[heroIdx];
      const pointsRaw = (cells[pointsIdx] || "").replace(/,/g, "");
      if (!name) return;

      const points = Number(pointsRaw);
      if (!Number.isFinite(points)) return;

      if (!(name in heroes) || heroes[name] < points) {
        heroes[name] = points;
      }
    });
  });

  return heroes;
}

async function main() {
  const html = await fetchRenderedHtml();
  console.log(`Fetched ${html.length} bytes of rendered HTML.`);

  const heroes = parseLeaderboard(html);

  if (Object.keys(heroes).length === 0) {
    console.error("--- HTML preview (first 1000 chars) for debugging ---");
    console.error(html.slice(0, 1000));
    throw new Error("Parsed 0 heroes — the site layout may have changed, check the selectors.");
  }

  let snapshots = {};
  if (existsSync(DATA_PATH)) {
    const raw = await readFile(DATA_PATH, "utf-8");
    snapshots = raw.trim() ? JSON.parse(raw) : {};
  }

  const today = new Date().toISOString().slice(0, 10);
  snapshots[today] = heroes; // upsert only today's entry

  const dates = Object.keys(snapshots).sort();
  while (dates.length > MAX_SNAPSHOTS) {
    delete snapshots[dates.shift()];
  }

  await mkdir(new URL("../data/", import.meta.url), { recursive: true });
  await writeFile(DATA_PATH, JSON.stringify(snapshots, null, 2) + "\n");

  console.log(`Saved snapshot for ${today}: ${Object.keys(heroes).length} heroes`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
