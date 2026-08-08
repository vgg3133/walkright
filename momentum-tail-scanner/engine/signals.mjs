// Deterministic signal detection + event study.
//
// Regenerates, from raw stored data, the research statistics that were
// previously hardcoded in app/page.tsx. All rules come from strategy.v1.json.
//
// Usage: node engine/signals.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  OUT_DIR, loadStrategy, loadJoinedSeries, smaAt, pct, round, fmtPct, mean, toCsv,
} from "./lib.mjs";

// Precompute derived columns on the joined series (adjusted-close returns,
// 200-session SMA, 3-session VIX change).
export function enrich(series, strategy) {
  const smaWindow = strategy.signal.conditions.spy_close_above_sma_sessions;
  const adj = series.map((r) => r.adjClose);
  return series.map((row, i) => ({
    ...row,
    index: i,
    sma: smaAt(adj, i, smaWindow),
    spyRet3: i >= 3 ? pct(adj[i], adj[i - 3]) : null,
    vixRet3: i >= 3 && row.vix != null && series[i - 3].vix != null
      ? pct(row.vix, series[i - 3].vix)
      : null,
  }));
}

// Condition sets. "full_gate" is the live strategy; the others are the
// comparison cohorts shown in the Research tab.
export const COHORTS = {
  full_gate: {
    label: "Full gate: -1%/3s, >200dma, VIX +5%/3s, VIX<VIX3M",
    test: (r, c) => r.spyRet3 != null && r.sma != null && r.vixRet3 != null && r.vix3m != null
      && r.spyRet3 <= c.spy_3_session_return_max
      && r.adjClose > r.sma
      && r.vixRet3 >= c.vix_3_session_return_min
      && r.vix < r.vix3m,
  },
  decline1_above200: {
    label: "-1%/3s decline, above 200dma (no VIX filters)",
    test: (r, c) => r.spyRet3 != null && r.sma != null
      && r.spyRet3 <= c.spy_3_session_return_max && r.adjClose > r.sma,
  },
  decline1: {
    label: "-1%/3s decline (no other filters)",
    test: (r) => r.spyRet3 != null && r.spyRet3 <= -0.01,
  },
  decline2: {
    label: "-2%/3s decline",
    test: (r) => r.spyRet3 != null && r.spyRet3 <= -0.02,
  },
  decline3: {
    label: "-3%/3s decline",
    test: (r) => r.spyRet3 != null && r.spyRet3 <= -0.03,
  },
  decline1_below200: {
    label: "-1%/3s decline, below 200dma",
    test: (r, c) => r.spyRet3 != null && r.sma != null
      && r.spyRet3 <= c.spy_3_session_return_max && r.adjClose < r.sma,
  },
  all_days: {
    label: "All sessions (baseline)",
    test: (r) => r.sma != null,
  },
};

export function detectCohort(enriched, cohortKey, strategy) {
  const cohort = COHORTS[cohortKey];
  const conditions = strategy.signal.conditions;
  return enriched.filter((row) => cohort.test(row, conditions));
}

// Forward outcomes for one signal row at one horizon.
export function forwardOutcome(enriched, signalIndex, horizon, touchThreshold) {
  const end = signalIndex + horizon;
  if (end >= enriched.length) return null;
  const signal = enriched[signalIndex];
  const fwd = pct(enriched[end].adjClose, signal.adjClose);
  const upLevel = signal.close * (1 + touchThreshold);
  const downLevel = signal.close * (1 - touchThreshold);
  let upTouch = false, downTouch = false;
  for (let i = signalIndex + 1; i <= end; i += 1) {
    if (enriched[i].high >= upLevel) upTouch = true;
    if (enriched[i].low <= downLevel) downTouch = true;
  }
  return { fwd, upTouch, downTouch };
}

export function eventStudy(enriched, signalRows, strategy) {
  const horizons = strategy.event_study.horizons_sessions;
  const touch = strategy.event_study.touch_threshold;
  const byHorizon = {};
  for (const h of horizons) {
    const outcomes = signalRows
      .map((row) => forwardOutcome(enriched, row.index, h, touch))
      .filter(Boolean);
    if (!outcomes.length) { byHorizon[h] = null; continue; }
    const fwds = outcomes.map((o) => o.fwd);
    byHorizon[h] = {
      n: outcomes.length,
      up_rate: round(outcomes.filter((o) => o.fwd > 0).length / outcomes.length),
      avg_fwd: round(mean(fwds)),
      touch_either: round(outcomes.filter((o) => o.upTouch || o.downTouch).length / outcomes.length),
      up_touch: round(outcomes.filter((o) => o.upTouch).length / outcomes.length),
      down_touch: round(outcomes.filter((o) => o.downTouch).length / outcomes.length),
    };
  }
  return byHorizon;
}

export function run() {
  const strategy = loadStrategy();
  const series = loadJoinedSeries();
  const enriched = enrich(series, strategy);

  const study = {
    strategy_version: strategy.version,
    generated_at_utc: new Date().toISOString(),
    data_last_date: series[series.length - 1].date,
    cohorts: {},
  };

  for (const key of Object.keys(COHORTS)) {
    const rows = detectCohort(enriched, key, strategy);
    study.cohorts[key] = {
      label: COHORTS[key].label,
      observations: rows.length,
      first_signal: rows[0]?.date ?? null,
      last_signal: rows[rows.length - 1]?.date ?? null,
      horizons: eventStudy(enriched, rows, strategy),
    };
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "event_study_v1.json"), JSON.stringify(study, null, 2) + "\n");

  // Full signal ledger for the live gate.
  const gateRows = detectCohort(enriched, "full_gate", strategy);
  const horizons = strategy.event_study.horizons_sessions;
  const ledger = gateRows.map((row) => {
    const record = {
      date: row.date,
      spy_close: row.close,
      spy_adj_close: row.adjClose,
      spy_ret3: round(row.spyRet3),
      sma200: round(row.sma, 2),
      vix: row.vix,
      vix_ret3: round(row.vixRet3),
      vix3m: row.vix3m,
    };
    for (const h of horizons) {
      const outcome = forwardOutcome(enriched, row.index, h, strategy.event_study.touch_threshold);
      record[`fwd_${h}s`] = outcome ? round(outcome.fwd) : "";
    }
    return record;
  });
  const columns = ["date", "spy_close", "spy_adj_close", "spy_ret3", "sma200", "vix", "vix_ret3", "vix3m",
    ...horizons.map((h) => `fwd_${h}s`)];
  writeFileSync(join(OUT_DIR, "signals_v1.csv"), toCsv(ledger, columns));

  return { study, gateCount: gateRows.length };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const { study, gateCount } = run();
  console.log(`Signals written: engine/out/signals_v1.csv (${gateCount} full-gate signals)`);
  console.log(`Event study written: engine/out/event_study_v1.json\n`);
  for (const [key, cohort] of Object.entries(study.cohorts)) {
    console.log(`${key} — ${cohort.label}`);
    console.log(`  observations: ${cohort.observations} (${cohort.first_signal ?? "-"} -> ${cohort.last_signal ?? "-"})`);
    for (const [h, s] of Object.entries(cohort.horizons)) {
      if (!s) continue;
      console.log(`  ${String(h).padStart(2)}s: n=${String(s.n).padStart(5)}  up=${fmtPct(s.up_rate)}  avg=${fmtPct(s.avg_fwd, 2)}  touch±3%=${fmtPct(s.touch_either)} (+${fmtPct(s.up_touch)}/-${fmtPct(s.down_touch)})`);
    }
    console.log("");
  }
}
