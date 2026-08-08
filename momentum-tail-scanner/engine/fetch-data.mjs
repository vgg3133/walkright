// Reproducible data layer: downloads SPY daily OHLC (Yahoo Finance),
// VIX and VIX3M history (Cboe), validates the schemas, and stores
// versioned snapshots with a provenance manifest.
//
// Usage: node engine/fetch-data.mjs

import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, sha256, toCsv, usDateToIso, assertSortedUniqueDates } from "./lib.mjs";

const SPY_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/SPY" +
  "?period1=0&period2=9999999999&interval=1d&events=div%2Csplit";
const VIX_URL = "https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv";
const VIX3M_URL = "https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX3M_History.csv";

async function getText(url) {
  const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`);
  return response.text();
}

function parseYahooSpy(jsonText) {
  const payload = JSON.parse(jsonText);
  const result = payload?.chart?.result?.[0];
  if (!result) throw new Error("Yahoo response missing chart.result[0]");
  const { timestamp } = result;
  const quote = result.indicators?.quote?.[0];
  const adj = result.indicators?.adjclose?.[0]?.adjclose;
  if (!timestamp || !quote || !adj) throw new Error("Yahoo response missing timestamp/quote/adjclose");

  const rows = [];
  for (let i = 0; i < timestamp.length; i += 1) {
    const open = quote.open[i], high = quote.high[i], low = quote.low[i];
    const close = quote.close[i], volume = quote.volume[i], adjClose = adj[i];
    if ([open, high, low, close, adjClose].some((v) => v == null || Number.isNaN(v))) continue;
    const date = new Date(timestamp[i] * 1000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    rows.push({
      date,
      open: open.toFixed(4),
      high: high.toFixed(4),
      low: low.toFixed(4),
      close: close.toFixed(4),
      adj_close: adjClose.toFixed(4),
      volume: String(volume ?? 0),
    });
  }
  if (rows.length < 5000) throw new Error(`Yahoo SPY returned only ${rows.length} rows; expected full history (>7000)`);
  assertSortedUniqueDates(rows, "yahoo SPY");
  return rows;
}

function parseCboe(csvText, label) {
  const lines = csvText.trim().split(/\r?\n/);
  const header = lines[0].trim().toUpperCase();
  if (header !== "DATE,OPEN,HIGH,LOW,CLOSE") {
    throw new Error(`${label}: unexpected header "${lines[0]}" — Cboe schema changed, refusing to parse`);
  }
  const rows = lines.slice(1).map((line) => {
    const [date, open, high, low, close] = line.split(",");
    const row = { date: usDateToIso(date), open, high, low, close };
    if (Number.isNaN(Number(close))) throw new Error(`${label}: non-numeric close on ${date}`);
    return row;
  });
  assertSortedUniqueDates(rows, label);
  return rows;
}

function writeDataset(manifest, filename, rows, columns, sourceUrl) {
  const csv = toCsv(rows, columns);
  writeFileSync(join(DATA_DIR, filename), csv);
  manifest.datasets[filename] = {
    source_url: sourceUrl,
    retrieved_at_utc: new Date().toISOString(),
    sha256: sha256(csv),
    rows: rows.length,
    first_date: rows[0].date,
    last_date: rows[rows.length - 1].date,
  };
  console.log(`  ${filename}: ${rows.length} rows, ${rows[0].date} -> ${rows[rows.length - 1].date}`);
}

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });
  const manifestPath = join(DATA_DIR, "manifest.json");
  const manifest = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, "utf8"))
    : { datasets: {} };

  console.log("Fetching SPY daily history (Yahoo Finance)...");
  const spy = parseYahooSpy(await getText(SPY_URL));
  writeDataset(manifest, "spy_daily.csv", spy, ["date", "open", "high", "low", "close", "adj_close", "volume"], SPY_URL);

  console.log("Fetching VIX history (Cboe)...");
  const vix = parseCboe(await getText(VIX_URL), "VIX");
  writeDataset(manifest, "vix_daily.csv", vix, ["date", "open", "high", "low", "close"], VIX_URL);

  console.log("Fetching VIX3M history (Cboe)...");
  const vix3m = parseCboe(await getText(VIX3M_URL), "VIX3M");
  writeDataset(manifest, "vix3m_daily.csv", vix3m, ["date", "open", "high", "low", "close"], VIX3M_URL);

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log("Provenance manifest written to engine/data/manifest.json");
}

main().catch((error) => {
  console.error("FETCH FAILED:", error.message);
  process.exit(1);
});
