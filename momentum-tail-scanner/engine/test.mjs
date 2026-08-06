// Unit tests for signal detection, contract selection, fills, and ledger P&L.
// Runs on synthetic fixtures with hand-computed expected values — no network.
//
// Usage: node --test engine/test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { enrich, detectCohort, forwardOutcome } from "./signals.mjs";
import {
  selectContract, entryFill, exitFill, runBacktest, summarize,
} from "./backtest-options.mjs";
import { loadStrategy, calendarDays } from "./lib.mjs";

const strategy = loadStrategy();

// ── Synthetic market: 200 sessions at 90, ramp to 105, then a 3-session
//    dip with a VIX pop that fires the full gate on exactly one day. ─────
function weekdays(count, start = "2024-01-01") {
  const out = [];
  const d = new Date(start + "T12:00:00Z");
  while (out.length < count) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function buildSeries() {
  const dates = weekdays(245);
  const rows = [];
  for (let i = 0; i < 245; i += 1) {
    let close;
    if (i < 200) close = 90;
    else if (i <= 217) close = 105;
    else if (i === 218) close = 104.5;
    else if (i === 219) close = 104;
    else if (i === 220) close = 103.9;
    else close = 104;
    let vixValue = 15;
    if (i >= 218 && i <= 220) vixValue = 16.5;
    rows.push({
      date: dates[i], open: close, high: close + 0.3, low: close - 0.3,
      close, adjClose: close, volume: 1000, vix: vixValue, vix3m: 18,
    });
  }
  return rows;
}

const series = buildSeries();
const enriched = enrich(series, strategy);
const signals = detectCohort(enriched, "full_gate", strategy);

test("signal fires on exactly the constructed day", () => {
  assert.equal(signals.length, 1);
  assert.equal(signals[0].index, 220);
  // ret3 = 103.9/105 - 1 ≈ -1.05%
  assert.ok(signals[0].spyRet3 < -0.01);
  // above 200dma (SMA dominated by the 90s)
  assert.ok(signals[0].adjClose > signals[0].sma);
  // VIX +10% and below VIX3M
  assert.ok(signals[0].vixRet3 >= 0.05);
  assert.ok(signals[0].vix < signals[0].vix3m);
});

test("forward outcome math", () => {
  const outcome = forwardOutcome(enriched, 220, 5, 0.03);
  // 104/103.9 - 1
  assert.equal(Math.abs(outcome.fwd - (104 / 103.9 - 1)) < 1e-12, true);
  assert.equal(outcome.upTouch, false);
  assert.equal(outcome.downTouch, false);
});

// ── Contract selection ────────────────────────────────────────────────────
const entryDate = enriched[221].date;
function isoAddDays(iso, days) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const expiration = isoAddDays(entryDate, 14); // DTE 14 within [10, 35] for hold=5

function quote(overrides) {
  return {
    quoteDate: entryDate, expiration, strike: 104, type: "call",
    bid: 2.0, ask: 2.1, volume: 50, openInterest: 500, delta: null,
    ...overrides,
  };
}
const selectArgs = { side: "call", entryDate, holdSessions: 5, spot: 104, rules: strategy.options };

test("selects nearest-ATM strike when no delta available", () => {
  const rows = [quote({ strike: 100 }), quote({ strike: 104 }), quote({ strike: 108 })];
  const picked = selectContract(rows, selectArgs);
  assert.equal(picked.reject, undefined);
  assert.equal(picked.contract.strike, 104);
  assert.equal(picked.selection, "nearest_atm");
});

test("prefers delta target when deltas present", () => {
  const rows = [
    quote({ strike: 100, delta: 0.62 }),
    quote({ strike: 104, delta: 0.48 }),
    quote({ strike: 108, delta: 0.55 }),
  ];
  const picked = selectContract(rows, selectArgs);
  assert.equal(picked.contract.strike, 104);
  assert.equal(picked.selection, "delta_target");
});

test("liquidity gates reject bad quotes", () => {
  assert.equal(selectContract([quote({ bid: 0 })], selectArgs).reject, "zero_or_no_bid");
  assert.equal(selectContract([quote({ bid: 2.0, ask: 2.6 })], selectArgs).reject, "spread_too_wide");
  assert.equal(selectContract([quote({ openInterest: 5 })], selectArgs).reject, "open_interest_too_low");
  assert.equal(selectContract([quote({ bid: 2.2, ask: 2.1 })], selectArgs).reject, "crossed_or_locked_quote");
});

test("rejects when no expiration inside the DTE window", () => {
  const tooNear = quote({ expiration: isoAddDays(entryDate, 3) });
  const tooFar = quote({ expiration: isoAddDays(entryDate, 90) });
  assert.equal(selectContract([tooNear, tooFar], selectArgs).reject, "no_expiration_in_window");
});

// ── Fill model ────────────────────────────────────────────────────────────
test("fill math is exact", () => {
  const q = quote({});
  // mid 2.05, half-spread toward ask 0.05 -> entry = 2.05 + 0.25*0.05
  assert.ok(Math.abs(entryFill(q, strategy.options.fill) - 2.0625) < 1e-9);
  const x = quote({ bid: 3.0, ask: 3.1 });
  assert.ok(Math.abs(exitFill(x, strategy.options.fill) - 3.0375) < 1e-9);
});

// ── End-to-end ledger ─────────────────────────────────────────────────────
test("end-to-end backtest produces the hand-computed ledger", () => {
  const exitDate = enriched[226].date; // entry 221 + hold 5
  const chains = new Map([
    [entryDate, [quote({})]],
    [exitDate, [quote({ quoteDate: exitDate, bid: 3.0, ask: 3.1 })]],
  ]);
  const ledger = runBacktest({ chains, side: "call", holdSessions: 5, strategy, enriched, signals });
  assert.equal(ledger.length, 1);
  const t = ledger[0];
  assert.equal(t.status, "filled");
  assert.equal(t.entry_date, entryDate);
  assert.equal(t.exit_date, exitDate);
  assert.equal(t.strike, 104);
  // cost = 2.0625*100 + 0.65 = 206.90 ; proceeds = 3.0375*100 - 0.65 = 303.10
  assert.equal(t.pnl_usd, 96.2);
  assert.equal(Math.abs(t.return_on_premium - 96.2 / 206.9) < 1e-4, true);

  const summary = summarize(ledger);
  assert.equal(summary.trades, 1);
  assert.equal(summary.win_rate, 1);
  assert.equal(summary.total_pnl_usd, 96.2);
});

test("missing exit quote rejects the trade with a reason", () => {
  const chains = new Map([[entryDate, [quote({})]]]);
  const ledger = runBacktest({ chains, side: "call", holdSessions: 5, strategy, enriched, signals });
  assert.equal(ledger[0].status, "rejected");
  assert.equal(ledger[0].reason, "missing_exit_quote");
});

test("expiration window uses calendar days", () => {
  assert.equal(calendarDays("2024-01-01", "2024-01-15"), 14);
});
