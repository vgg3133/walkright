// Downloads SPY EOD option chains from a locally running Theta Terminal
// (v3 REST API) for exactly the dates the backtest needs, and writes them
// in the chain-CSV schema that engine/backtest-options.mjs consumes.
//
// Prerequisites:
//   1. A ThetaData account (free tier works: EOD from 2023-06-01)
//   2. Theta Terminal running and logged in on this machine
//      (it listens on http://127.0.0.1:25503)
//
// Usage:
//   node engine/fetch-chains-thetadata.mjs                 # default holds 2,5,10
//   node engine/fetch-chains-thetadata.mjs --start=2020-01-01 --holds=5
//
// The script is resumable: already-downloaded dates are skipped on re-run.

import { mkdirSync, writeFileSync, readFileSync, existsSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, loadStrategy, loadJoinedSeries, parseCsv } from "./lib.mjs";
import { enrich, detectCohort } from "./signals.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=")),
);
const BASE = args.base ?? "http://127.0.0.1:25503";
const START = args.start ?? "2023-06-01"; // free-tier coverage start
const HOLDS = (args.holds ?? "2,5,10").split(",").map(Number);
const MAX_DTE = Number(args["max-dte"] ?? 60);
const THROTTLE_MS = Number(args.throttle ?? 2600); // free tier: 20-30 req/min
const OUT_FILE = join(DATA_DIR, "chains_thetadata.csv");
const OUT_COLUMNS = "quote_date,expiration,strike,type,bid,ask,volume,open_interest,delta,iv";

function iso(value) {
  const digits = String(value).replaceAll("-", "");
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

// Dates the backtester will actually look at: entry (signal+1 session) and
// exit (entry+hold sessions) for every signal and every requested hold.
function neededDates() {
  const strategy = loadStrategy();
  const enriched = enrich(loadJoinedSeries(), strategy);
  const signals = detectCohort(enriched, "full_gate", strategy).filter((s) => s.date >= START);
  const dates = new Set();
  for (const signal of signals) {
    const entry = signal.index + 1;
    if (entry < enriched.length) dates.add(enriched[entry].date);
    for (const hold of HOLDS) {
      const exit = entry + hold;
      if (exit < enriched.length) dates.add(enriched[exit].date);
    }
  }
  return { dates: [...dates].sort(), signalCount: signals.length };
}

function alreadyFetched() {
  if (!existsSync(OUT_FILE)) return new Set();
  return new Set(parseCsv(readFileSync(OUT_FILE, "utf8")).map((r) => r.quote_date));
}

// Map one Theta Terminal CSV row onto our schema, tolerating v3 naming drift.
function convertRow(row, requestDate) {
  const right = (row.right ?? row.type ?? "").toLowerCase();
  const type = right.startsWith("c") ? "call" : right.startsWith("p") ? "put" : null;
  const expiration = row.expiration ? iso(row.expiration) : null;
  const bid = row.bid, ask = row.ask;
  if (!type || !expiration || bid === undefined || ask === undefined) return null;
  const strike = Number(row.strike) > 10000 ? Number(row.strike) / 1000 : Number(row.strike); // v2 used 1/1000ths
  return [
    row.date ? iso(row.date) : requestDate,
    expiration,
    strike,
    type,
    bid,
    ask,
    row.volume ?? 0,
    row.open_interest ?? "", // EOD report has no OI (separate endpoint, paid tiers)
    row.delta ?? "",
    row.implied_vol ?? row.iv ?? "",
  ].join(",");
}

async function fetchDay(date) {
  const compact = date.replaceAll("-", "");
  const url = `${BASE}/v3/option/history/eod?symbol=SPY&expiration=*&strike=*&right=both` +
    `&start_date=${compact}&end_date=${compact}&max_dte=${MAX_DTE}&format=csv`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${date}: ${(await response.text()).slice(0, 200)}`);
  return response.text();
}

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });
  const { dates, signalCount } = neededDates();
  const done = alreadyFetched();
  const todo = dates.filter((d) => !done.has(d));
  console.log(`${signalCount} signals since ${START} -> ${dates.length} chain dates needed, ${todo.length} to fetch (${done.size} already present).`);
  if (!todo.length) { console.log("Nothing to do."); return; }
  if (!existsSync(OUT_FILE)) writeFileSync(OUT_FILE, OUT_COLUMNS + "\n");

  let fetched = 0, rows = 0;
  for (const date of todo) {
    try {
      const csv = await fetchDay(date);
      const parsed = parseCsv(csv);
      if (!parsed.length) { console.log(`  ${date}: empty response`); continue; }
      const converted = parsed.map((r) => convertRow(r, date)).filter(Boolean);
      if (!converted.length) {
        console.log(`  ${date}: could not map columns — response header was: ${Object.keys(parsed[0]).join(",")}`);
        continue;
      }
      appendFileSync(OUT_FILE, converted.join("\n") + "\n");
      fetched += 1; rows += converted.length;
      console.log(`  ${date}: ${converted.length} contracts (${fetched}/${todo.length})`);
    } catch (error) {
      console.error(`  ${date}: FAILED — ${error.message}`);
      if (/ECONNREFUSED/.test(error.message)) {
        console.error("\nTheta Terminal is not running on this machine (or not on port 25503).");
        console.error("Start it, log in, and re-run this script — it resumes where it left off.");
        process.exit(1);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, THROTTLE_MS));
  }
  console.log(`\nDone: ${fetched} dates, ${rows} contract rows appended to ${OUT_FILE}`);
  console.log(`Next: npm run engine:backtest -- --chains=engine/data/chains_thetadata.csv`);
}

main().catch((error) => { console.error("FAILED:", error.message); process.exit(1); });
