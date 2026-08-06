// Research variants: literature-motivated refinements tested on the same
// raw data as the frozen v1 event study. This script does NOT change
// strategy.v1.json — it exists to inform a future v1.1 decision.
//
// Variants tested:
//   A. Entry basis: signal close vs next open vs next close (edge decay)
//   B. RSI(2) refinement on top of the full gate (Connors-style)
//   C. Value of the contango condition (gate with / without VIX<VIX3M)
//   D. Exit style: fixed 5-session hold vs first close above 5-session SMA
//
// Usage: node engine/research-variants.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OUT_DIR, loadStrategy, loadJoinedSeries, pct, round, fmtPct, mean, median, smaAt } from "./lib.mjs";
import { enrich, detectCohort, COHORTS } from "./signals.mjs";

const strategy = loadStrategy();
const series = loadJoinedSeries();
const enriched = enrich(series, strategy);
const adj = enriched.map((r) => r.adjClose);

// Wilder RSI(2) on adjusted closes.
function computeRsi2() {
  const rsi = new Array(enriched.length).fill(null);
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i < enriched.length; i += 1) {
    const change = adj[i] - adj[i - 1];
    const gain = Math.max(change, 0), loss = Math.max(-change, 0);
    if (i <= 2) { avgGain += gain / 2; avgLoss += loss / 2; }
    else { avgGain = (avgGain + gain) / 2; avgLoss = (avgLoss + loss) / 2; }
    if (i >= 2) rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsi;
}
const rsi2 = computeRsi2();

function stats(returns) {
  if (!returns.length) return null;
  return {
    n: returns.length,
    up_rate: round(returns.filter((r) => r > 0).length / returns.length),
    avg: round(mean(returns)),
    median: round(median(returns)),
  };
}

function fwdFromClose(row, h) {
  const end = row.index + h;
  return end < enriched.length ? pct(adj[end], adj[row.index]) : null;
}
function fwdFromNextClose(row, h) {
  const start = row.index + 1, end = start + h;
  return end < enriched.length ? pct(adj[end], adj[start]) : null;
}
// Raw open -> raw close (dividends ignored; small on <=3-week holds).
function fwdFromNextOpen(row, h) {
  const start = row.index + 1, end = start + h;
  return end < enriched.length ? pct(enriched[end].close, enriched[start].open) : null;
}

const report = { generated_at_utc: new Date().toISOString(), variants: {} };
const gate = detectCohort(enriched, "full_gate", strategy);

// ── A. Entry basis ────────────────────────────────────────────────────────
{
  const bases = { signal_close: fwdFromClose, next_open: fwdFromNextOpen, next_close: fwdFromNextClose };
  const out = {};
  for (const [name, fn] of Object.entries(bases)) {
    out[name] = {};
    for (const h of [2, 5, 10]) {
      out[name][`${h}s`] = stats(gate.map((row) => fn(row, h)).filter((v) => v != null));
    }
  }
  report.variants.entry_basis = {
    question: "How much of the edge survives entering at the next open / next close instead of the signal close?",
    results: out,
  };
}

// ── B. RSI(2) refinement ──────────────────────────────────────────────────
{
  const out = {};
  for (const [label, testFn] of Object.entries({
    gate_all: () => true,
    gate_rsi2_lt_25: (row) => rsi2[row.index] != null && rsi2[row.index] < 25,
    gate_rsi2_lt_10: (row) => rsi2[row.index] != null && rsi2[row.index] < 10,
  })) {
    const rows = gate.filter(testFn);
    out[label] = {};
    for (const h of [2, 5, 10]) {
      out[label][`${h}s`] = stats(rows.map((row) => fwdFromNextClose(row, h)).filter((v) => v != null));
    }
  }
  report.variants.rsi2_refinement = {
    question: "Does a Connors-style RSI(2) oversold filter concentrate the edge? (next-close entry basis)",
    results: out,
  };
}

// ── C. Contango condition value ───────────────────────────────────────────
{
  const conditions = strategy.signal.conditions;
  const noContango = enriched.filter((r) =>
    r.spyRet3 != null && r.sma != null && r.vixRet3 != null && r.vix3m != null
    && r.spyRet3 <= conditions.spy_3_session_return_max
    && r.adjClose > r.sma
    && r.vixRet3 >= conditions.vix_3_session_return_min);
  const backwardation = noContango.filter((r) => r.vix >= r.vix3m);
  const out = {};
  for (const [label, rows] of Object.entries({
    with_contango_v1: gate, without_term_filter: noContango, backwardation_only: backwardation,
  })) {
    out[label] = {};
    for (const h of [2, 5, 10]) {
      out[label][`${h}s`] = stats(rows.map((row) => fwdFromNextClose(row, h)).filter((v) => v != null));
    }
  }
  report.variants.contango_value = {
    question: "Does requiring VIX<VIX3M (condition 4) actually help?",
    results: out,
  };
}

// ── D. Exit style (non-overlapping, next-close entry) ─────────────────────
{
  function simulate(exitStyle, cap) {
    const returns = [], holds = [];
    let blockedUntil = -1;
    for (const row of gate) {
      const entry = row.index + 1;
      if (row.index <= blockedUntil || entry + cap >= enriched.length) continue;
      let exit = entry + cap;
      if (exitStyle === "first_close_above_sma5") {
        for (let i = entry + 1; i <= entry + cap; i += 1) {
          const sma5 = smaAt(adj, i, 5);
          if (sma5 != null && adj[i] > sma5) { exit = i; break; }
        }
      }
      returns.push(pct(adj[exit], adj[entry]));
      holds.push(exit - entry);
      blockedUntil = exit;
    }
    return { ...stats(returns), avg_hold_sessions: round(mean(holds), 1) };
  }
  report.variants.exit_style = {
    question: "Fixed 5-session hold vs Connors-style exit on first close above the 5-session SMA (capped at 10 sessions)? Non-overlapping trades, next-close entry.",
    results: {
      time_exit_5s: simulate("time", 5),
      first_close_above_sma5_cap10: simulate("first_close_above_sma5", 10),
    },
  };
}

// ── E. Literature-suggested guards (IBS entry filter, trend-transition) ───
{
  // IBS = (close - low) / (high - low) on the signal day (Pagonidis/NAAIM).
  function ibs(row) {
    const range = row.high - row.low;
    return range > 0 ? (row.close - row.low) / range : 0.5;
  }
  // 200DMA slope proxy: SMA today vs 20 sessions ago.
  function smaRising(row) {
    if (row.index < 20) return false;
    const prior = smaAt(adj, row.index - 20, 200);
    return prior != null && row.sma != null && row.sma >= prior;
  }
  const out = {};
  for (const [label, testFn] of Object.entries({
    gate_all: () => true,
    gate_ibs_lt_02: (row) => ibs(row) < 0.2,
    gate_sma200_rising: (row) => smaRising(row),
    gate_2pct_above_sma: (row) => row.adjClose >= row.sma * 1.02,
  })) {
    const rows = gate.filter(testFn);
    out[label] = {};
    for (const h of [2, 5, 10]) {
      out[label][`${h}s`] = stats(rows.map((row) => fwdFromNextClose(row, h)).filter((v) => v != null));
    }
  }
  report.variants.literature_guards = {
    question: "Literature-suggested refinements: IBS<0.2 oversold filter (Pagonidis); trend-transition guards (rising 200DMA, or >=2% above it) instead of relying on the contango leg for bear protection.",
    results: out,
  };
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "research_variants_v1.json"), JSON.stringify(report, null, 2) + "\n");
console.log("Written: engine/out/research_variants_v1.json\n");

for (const [key, variant] of Object.entries(report.variants)) {
  console.log(`## ${key}: ${variant.question}`);
  for (const [name, result] of Object.entries(variant.results)) {
    if (result && result.n !== undefined) {
      console.log(`  ${name}: n=${result.n} up=${fmtPct(result.up_rate)} avg=${fmtPct(result.avg, 2)} med=${fmtPct(result.median, 2)} hold=${result.avg_hold_sessions ?? "-"}s`);
    } else {
      for (const [h, s] of Object.entries(result)) {
        if (s) console.log(`  ${name} ${h}: n=${s.n} up=${fmtPct(s.up_rate)} avg=${fmtPct(s.avg, 2)} med=${fmtPct(s.median, 2)}`);
      }
    }
  }
  console.log("");
}
