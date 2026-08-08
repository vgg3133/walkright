// Research: compare option STRUCTURES on the same signals, data, and fill
// model as the frozen v1 long-call backtest. Does not modify strategy.v1.json —
// structure choice is the open research question this script informs.
//
// Structures:
//   long_call          — v1 baseline (must reproduce backtest-options.mjs)
//   call_debit_spread  — buy v1 call, sell call ~2% of spot higher, same expiration
//   put_credit_spread  — sell put ~2% below spot, buy put ~6% below, same expiration
//
// Fills: every bought leg at mid + slip*(ask-mid), every sold leg at
// mid - slip*(mid-bid); $0.65/contract/side per leg. Returns for debit
// structures are on net debit; for credit structures on max loss (margin).
//
// Usage: node engine/backtest-structures.mjs --chains=engine/data/chains_thetadata.csv [--holds=2,5,10]

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  OUT_DIR, loadStrategy, loadJoinedSeries, toCsv, round, fmtPct, mean, median, calendarDays,
} from "./lib.mjs";
import { enrich, detectCohort } from "./signals.mjs";
import { loadChains, selectContract } from "./backtest-options.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=")),
);
if (!args.chains) {
  console.error("Usage: node engine/backtest-structures.mjs --chains=path [--holds=2,5,10]");
  process.exit(1);
}
const HOLDS = (args.holds ?? "2,5,10").split(",").map(Number);

const strategy = loadStrategy();
const rules = strategy.options;
const fill = rules.fill;
const SLIP = fill.slippage_frac_of_half_spread;
const FEE = fill.fee_per_contract_per_side_usd;
const MULT = fill.contract_multiplier;

function buyFill(q) { const mid = (q.bid + q.ask) / 2; return mid + SLIP * (q.ask - mid); }
function sellFill(q) { const mid = (q.bid + q.ask) / 2; return mid - SLIP * (mid - q.bid); }

function liquidityReason(q) {
  if (q.bid < rules.liquidity.min_bid) return "zero_or_no_bid";
  if (q.ask <= q.bid) return "crossed_or_locked_quote";
  const mid = (q.bid + q.ask) / 2;
  const maxSpread = Math.max(rules.liquidity.max_spread_abs_usd, rules.liquidity.max_spread_frac_of_mid * mid);
  if (q.ask - q.bid > maxSpread) return "spread_too_wide";
  if (q.openInterest != null && q.openInterest < rules.liquidity.min_open_interest) return "open_interest_too_low";
  return null;
}

function nearestStrike(chainRows, { side, expiration, target, exclude = [] }) {
  const candidates = chainRows.filter((q) =>
    q.type === side && q.expiration === expiration && !exclude.includes(q.strike));
  if (!candidates.length) return null;
  candidates.sort((a, b) => Math.abs(a.strike - target) - Math.abs(b.strike - target) || a.strike - b.strike);
  return candidates[0];
}

// Pick the same expiration the v1 selector would use for this side/hold.
function pickExpiration(chainRows, side, entryDate, hold) {
  const minDte = hold + rules.expiration.min_calendar_dte_beyond_hold;
  const maxDte = hold + rules.expiration.max_calendar_dte_beyond_hold;
  const exps = [...new Set(chainRows
    .filter((q) => q.type === side && calendarDays(entryDate, q.expiration) >= minDte
      && calendarDays(entryDate, q.expiration) <= maxDte)
    .map((q) => q.expiration))].sort();
  return exps[0] ?? null;
}

// Each builder returns { legs: [{dir, q}], riskBasis } or { reject }.
// dir +1 = buy at entry, sell at exit; dir -1 = sell at entry, buy back at exit.
const STRUCTURES = {
  long_call(chainRows, ctx) {
    const picked = selectContract(chainRows, { side: "call", entryDate: ctx.entryDate, holdSessions: ctx.hold, spot: ctx.spot, rules });
    if (picked.reject) return { reject: picked.reject };
    return { legs: [{ dir: 1, q: picked.contract }], riskBasis: "debit" };
  },
  call_debit_spread(chainRows, ctx) {
    const picked = selectContract(chainRows, { side: "call", entryDate: ctx.entryDate, holdSessions: ctx.hold, spot: ctx.spot, rules });
    if (picked.reject) return { reject: picked.reject };
    const long = picked.contract;
    const short = nearestStrike(chainRows, {
      side: "call", expiration: long.expiration, target: long.strike + 0.02 * ctx.spot, exclude: [long.strike],
    });
    if (!short || short.strike <= long.strike) return { reject: "no_short_strike_above_long" };
    const liq = liquidityReason(short);
    if (liq) return { reject: "short_leg_" + liq };
    return { legs: [{ dir: 1, q: long }, { dir: -1, q: short }], riskBasis: "debit" };
  },
  put_credit_spread(chainRows, ctx) {
    const expiration = pickExpiration(chainRows, "put", ctx.entryDate, ctx.hold);
    if (!expiration) return { reject: "no_expiration_in_window" };
    const short = nearestStrike(chainRows, { side: "put", expiration, target: 0.98 * ctx.spot });
    if (!short) return { reject: "no_short_put" };
    const long = nearestStrike(chainRows, { side: "put", expiration, target: 0.94 * ctx.spot, exclude: [short.strike] });
    if (!long || long.strike >= short.strike) return { reject: "no_long_put_below_short" };
    for (const [leg, q] of [["short_leg_", short], ["long_leg_", long]]) {
      const liq = liquidityReason(q);
      if (liq) return { reject: leg + liq };
    }
    return { legs: [{ dir: -1, q: short }, { dir: 1, q: long }], riskBasis: "credit" };
  },
};

function findExitQuote(chains, exitDate, leg) {
  return (chains.get(exitDate) ?? []).find((q) =>
    q.type === leg.q.type && q.expiration === leg.q.expiration && q.strike === leg.q.strike);
}

function runStructure(structureName, chains, enriched, signals, hold) {
  const build = STRUCTURES[structureName];
  const ledger = [];
  let blockedUntil = -1;
  for (const signal of signals) {
    const entryIndex = signal.index + 1;
    const exitIndex = entryIndex + hold;
    const base = { signal_date: signal.date, structure: structureName, hold_sessions: hold };
    if (signal.index <= blockedUntil) { ledger.push({ ...base, status: "skipped", reason: "position_open" }); continue; }
    if (exitIndex >= enriched.length) { ledger.push({ ...base, status: "rejected", reason: "insufficient_forward_data" }); continue; }
    const entryRow = enriched[entryIndex];
    const exitRow = enriched[exitIndex];
    const chainRows = chains.get(entryRow.date);
    if (!chainRows) { ledger.push({ ...base, status: "rejected", reason: "no_chain_for_entry_date" }); continue; }

    const built = build(chainRows, { entryDate: entryRow.date, hold, spot: entryRow.close });
    if (built.reject) { ledger.push({ ...base, status: "rejected", reason: built.reject }); continue; }
    const { legs, riskBasis } = built;
    if (legs.some((leg) => leg.q.expiration < exitRow.date)) {
      ledger.push({ ...base, status: "rejected", reason: "contract_expires_before_exit" }); continue;
    }
    const exits = legs.map((leg) => findExitQuote(chains, exitRow.date, leg));
    if (exits.some((q) => !q)) { ledger.push({ ...base, status: "rejected", reason: "missing_exit_quote" }); continue; }

    // Entry cash flow: buys negative, sells positive; fees per leg per side.
    let entryCash = 0, exitCash = 0;
    for (let i = 0; i < legs.length; i += 1) {
      const leg = legs[i];
      entryCash += (leg.dir === 1 ? -buyFill(leg.q) : sellFill(leg.q)) * MULT - FEE;
      exitCash += (leg.dir === 1 ? sellFill(exits[i]) : -buyFill(exits[i])) * MULT - FEE;
    }
    const pnl = entryCash + exitCash;
    let risk;
    if (riskBasis === "debit") {
      risk = -entryCash; // net debit paid incl fees
    } else {
      const width = Math.abs(legs[0].q.strike - legs[1].q.strike) * MULT;
      risk = width - entryCash; // max loss = width - net credit received
    }
    ledger.push({
      ...base, status: "filled",
      entry_date: entryRow.date, exit_date: exitRow.date,
      expiration: legs[0].q.expiration,
      legs: legs.map((l) => `${l.dir === 1 ? "+" : "-"}${l.q.strike}${l.q.type[0].toUpperCase()}`).join("/"),
      net_entry_usd: round(entryCash, 2), net_exit_usd: round(exitCash, 2),
      risk_usd: round(risk, 2), pnl_usd: round(pnl, 2),
      return_on_risk: round(pnl / risk),
    });
    blockedUntil = exitIndex;
  }
  return ledger;
}

function summarize(ledger) {
  const filled = ledger.filter((t) => t.status === "filled");
  if (!filled.length) return { trades: 0 };
  const wins = filled.filter((t) => t.pnl_usd > 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl_usd, 0);
  const grossLoss = filled.filter((t) => t.pnl_usd < 0).reduce((s, t) => s - t.pnl_usd, 0);
  const sorted = [...filled].sort((a, b) => b.pnl_usd - a.pnl_usd);
  const total = round(filled.reduce((s, t) => s + t.pnl_usd, 0), 2);
  const top2 = sorted.slice(0, 2).reduce((s, t) => s + t.pnl_usd, 0);
  return {
    trades: filled.length,
    win_rate: round(wins.length / filled.length),
    total_pnl_usd: total,
    profit_factor: grossLoss > 0 ? round(grossWin / grossLoss, 2) : null,
    avg_return_on_risk: round(mean(filled.map((t) => t.return_on_risk))),
    median_return_on_risk: round(median(filled.map((t) => t.return_on_risk))),
    worst_trade_usd: round(sorted[sorted.length - 1].pnl_usd, 2),
    total_minus_top2_usd: round(total - top2, 2),
    avg_risk_usd: round(mean(filled.map((t) => t.risk_usd)), 2),
  };
}

const enriched = enrich(loadJoinedSeries(), strategy);
const signals = detectCohort(enriched, "full_gate", strategy);
const chains = loadChains(args.chains);
console.log(`Chains: ${chains.size} dates | Signals: ${signals.length} | Holds: ${HOLDS.join(",")}\n`);

mkdirSync(OUT_DIR, { recursive: true });
const results = {};
for (const structureName of Object.keys(STRUCTURES)) {
  results[structureName] = {};
  for (const hold of HOLDS) {
    const ledger = runStructure(structureName, chains, enriched, signals, hold);
    results[structureName][`${hold}s`] = summarize(ledger);
    const columns = ["signal_date", "structure", "hold_sessions", "status", "reason", "entry_date", "exit_date",
      "expiration", "legs", "net_entry_usd", "net_exit_usd", "risk_usd", "pnl_usd", "return_on_risk"];
    writeFileSync(join(OUT_DIR, `structures_${structureName}_${hold}s.csv`), toCsv(ledger, columns));
  }
}
writeFileSync(join(OUT_DIR, "structures_summary.json"), JSON.stringify({
  generated_at_utc: new Date().toISOString(), strategy_version: strategy.version, results,
}, null, 2) + "\n");

for (const [name, byHold] of Object.entries(results)) {
  console.log(`## ${name}`);
  for (const [h, s] of Object.entries(byHold)) {
    if (!s.trades) { console.log(`  ${h}: no trades`); continue; }
    console.log(`  ${h}: n=${s.trades} win=${fmtPct(s.win_rate)} PF=${s.profit_factor} total=$${s.total_pnl_usd}` +
      ` avgRoR=${fmtPct(s.avg_return_on_risk)} medRoR=${fmtPct(s.median_return_on_risk)}` +
      ` worst=$${s.worst_trade_usd} totalMinusTop2=$${s.total_minus_top2_usd} avgRisk=$${s.avg_risk_usd}`);
  }
  console.log("");
}
console.log("Ledgers: engine/out/structures_<name>_<hold>s.csv | Summary: engine/out/structures_summary.json");
