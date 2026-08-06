import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ENGINE_DIR = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(ENGINE_DIR, "data");
export const OUT_DIR = join(ENGINE_DIR, "out");

export function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const strip = (v) => {
    const t = v.trim();
    return t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t;
  };
  const header = lines[0].split(",").map((h) => strip(h).toLowerCase());
  return lines.slice(1).map((line) => {
    const values = line.split(",");
    const row = {};
    header.forEach((key, i) => { row[key] = values[i] !== undefined ? strip(values[i]) : ""; });
    return row;
  });
}

export function toCsv(rows, columns) {
  const header = columns.join(",");
  const body = rows.map((r) => columns.map((c) => r[c] ?? "").join(",")).join("\n");
  return header + "\n" + body + "\n";
}

// mm/dd/yyyy -> yyyy-mm-dd
export function usDateToIso(value) {
  const [month, day, year] = value.split("/");
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function assertSortedUniqueDates(rows, label) {
  for (let i = 1; i < rows.length; i += 1) {
    if (rows[i].date <= rows[i - 1].date) {
      throw new Error(`${label}: dates not strictly increasing at row ${i} (${rows[i - 1].date} -> ${rows[i].date})`);
    }
  }
}

export function loadStrategy() {
  return JSON.parse(readFileSync(join(ENGINE_DIR, "strategy.v1.json"), "utf8"));
}

export function loadDataset(name) {
  const path = join(DATA_DIR, name);
  if (!existsSync(path)) {
    throw new Error(`Missing ${path}. Run: node engine/fetch-data.mjs`);
  }
  return parseCsv(readFileSync(path, "utf8"));
}

// Load SPY + VIX + VIX3M into one date-aligned series (SPY calendar is the master).
export function loadJoinedSeries() {
  const spy = loadDataset("spy_daily.csv").map((r) => ({
    date: r.date,
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    adjClose: Number(r.adj_close),
    volume: Number(r.volume),
  }));
  assertSortedUniqueDates(spy, "spy_daily.csv");
  const vix = new Map(loadDataset("vix_daily.csv").map((r) => [r.date, Number(r.close)]));
  const vix3m = new Map(loadDataset("vix3m_daily.csv").map((r) => [r.date, Number(r.close)]));
  return spy.map((row) => ({
    ...row,
    vix: vix.get(row.date) ?? null,
    vix3m: vix3m.get(row.date) ?? null,
  }));
}

export function smaAt(values, index, window) {
  if (index + 1 < window) return null;
  let sum = 0;
  for (let i = index - window + 1; i <= index; i += 1) sum += values[i];
  return sum / window;
}

export function pct(a, b) {
  return a / b - 1;
}

export function round(value, places = 4) {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

export function fmtPct(value, places = 1) {
  return (value * 100).toFixed(places) + "%";
}

export function mean(values) {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Calendar-day difference between two ISO dates.
export function calendarDays(fromIso, toIso) {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000);
}
