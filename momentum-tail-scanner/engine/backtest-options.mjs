// Deterministic EOD options backtester.
//
// Replays full-gate signals chronologically, selects a contract using only
// data available at the historical decision time, fills entries and exits
// from historical EOD NBBO with configurable slippage and fees, and emits
// an auditable trade ledger with rejection reasons.
//
// Chain data is supplied as CSV (one file, or a directory of files) with
// the schema:
//   quote_date,expiration,strike,type,bid,ask,volume,open_interest[,delta][,iv]
// dates ISO (yyyy-mm-dd), type "call"|"put". ThetaData and Cboe DataShop
// EOD exports both map onto this with a column rename.
//
// Usage: node engine/backtest-options.mjs --chains=path/to/chains.csv [--side=call|put] [--hold=5]

import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  OUT_DIR, loadStrategy, loadJoinedSeries, parseCsv, toCsv, round, fmtPct,
  mean, median, calendarDays,
} from "./lib.mjs";
import { enrich, detectCohort } from "./signals.mjs";

// ── Chain store ───────────────────────────────────────────────────────────
export function loadChains(path) {
  const files = statSync(path).isDirectory()
    ? readdirSync(path).filter((f) => f.endsWith(".csv")).map((f) => join(path, f))
    : [path];
  const byDate = new Map();
  for (const file of files) {
    for (const row of parseCsv(readFileSync(file, "utf8"))) {
      const quote = {
        quoteDate: row.quote_date,
        expiration: row.expiration,
        strike: Number(row.strike),
        type: row.type.toLowerCase(),
        bid: Number(row.bid),
        ask: Number(row.ask),
        volume: Number(row.volume || 0),
        openInterest: Number(row.open_interest || 0),
        delta: row.delta !== undefined && row.delta !== "" ? Number(row.delta) : null,
      };
      if (!byDate.has(quote.quoteDate)) byDate.set(quote.quoteDate, []);
      byDate.get(quote.quoteDate).push(quote);
    }
  }
  return byDate;
}

// ── Contract selection (no look-ahead: only rows quoted on entryDate) ─────
export function selectContract(chainRows, { side, entryDate, holdSessions, spot, rules }) {
  const exp = rules.expiration;
  const minDte = holdSessions + exp.min_calendar_dte_beyond_hold;
  const maxDte = holdSessions + exp.max_calendar_dte_beyond_hold;

  const candidates = chainRows.filter((q) => {
    if (q.type !== side) return false;
    const dte = calendarDays(entryDate, q.expiration);
    return dte >= minDte && dte <= maxDte;
  });
  if (!candidates.length) return { reject: "no_expiration_in_window" };

  // Nearest expiration within the window.
  const expirations = [...new Set(candidates.map((q) => q.expiration))].sort();
  const chosenExp = expirations[0];
  const atExp = candidates.filter((q) => q.expiration === chosenExp);

  // Delta target when every candidate carries delta; otherwise nearest ATM.
  const target = rules.strike.delta_target * (side === "call" ? 1 : -1);
  const haveDelta = atExp.every((q) => q.delta != null && !Number.isNaN(q.delta));
  const scored = atExp
    .map((q) => ({
      q,
      score: haveDelta ? Math.abs(q.delta - target) : Math.abs(q.strike - spot),
    }))
    .sort((a, b) => a.score - b.score || a.q.strike - b.q.strike);
  const pick = scored[0].q;

  // Liquidity gates.
  const liq = rules.liquidity;
  if (pick.bid < liq.min_bid) return { reject: "zero_or_no_bid", contract: pick };
  if (pick.ask <= pick.bid) return { reject: "crossed_or_locked_quote", contract: pick };
  const mid = (pick.bid + pick.ask) / 2;
  const spread = pick.ask - pick.bid;
  const maxSpread = Math.max(liq.max_spread_abs_usd, liq.max_spread_frac_of_mid * mid);
  if (spread > maxSpread) return { reject: "spread_too_wide", contract: pick };
  if (pick.openInterest < liq.min_open_interest) return { reject: "open_interest_too_low", contract: pick };
  if (pick.volume < liq.min_volume) return { reject: "volume_too_low", contract: pick };

  return { contract: pick, selection: haveDelta ? "delta_target" : "nearest_atm" };
}

// ── Fill model ────────────────────────────────────────────────────────────
export function entryFill(quote, fill) {
  const mid = (quote.bid + quote.ask) / 2;
  return mid + fill.slippage_frac_of_half_spread * (quote.ask - mid);
}
export function exitFill(quote, fill) {
  const mid = (quote.bid + quote.ask) / 2;
  return mid - fill.slippage_frac_of_half_spread * (mid - quote.bid);
}

// ── Backtest ──────────────────────────────────────────────────────────────
export function runBacktest({ chains, side, holdSessions, strategy, enriched, signals }) {
  const rules = strategy.options;
  const fill = rules.fill;
  const multiplier = fill.contract_multiplier;
  const ledger = [];
  let blockedUntilIndex = -1;

  for (const signal of signals) {
    const entryIndex = signal.index + 1;
    const exitIndex = entryIndex + holdSessions;
    const base = { signal_date: signal.date, side, hold_sessions: holdSessions };

    if (signal.index <= blockedUntilIndex) {
      ledger.push({ ...base, status: "skipped", reason: "position_open" });
      continue;
    }
    if (exitIndex >= enriched.length) {
      ledger.push({ ...base, status: "rejected", reason: "insufficient_forward_data" });
      continue;
    }
    const entryRow = enriched[entryIndex];
    const exitRow = enriched[exitIndex];
    const chainRows = chains.get(entryRow.date);
    if (!chainRows) {
      ledger.push({ ...base, status: "rejected", reason: "no_chain_for_entry_date", entry_date: entryRow.date });
      continue;
    }
    const picked = selectContract(chainRows, {
      side, entryDate: entryRow.date, holdSessions, spot: entryRow.close, rules,
    });
    if (picked.reject) {
      ledger.push({
        ...base, status: "rejected", reason: picked.reject, entry_date: entryRow.date,
        strike: picked.contract?.strike ?? "", expiration: picked.contract?.expiration ?? "",
      });
      continue;
    }
    const contract = picked.contract;
    if (contract.expiration < exitRow.date) {
      ledger.push({ ...base, status: "rejected", reason: "contract_expires_before_exit", entry_date: entryRow.date });
      continue;
    }
    const exitQuote = (chains.get(exitRow.date) ?? []).find(
      (q) => q.type === side && q.expiration === contract.expiration && q.strike === contract.strike,
    );
    if (!exitQuote) {
      ledger.push({
        ...base, status: "rejected", reason: "missing_exit_quote", entry_date: entryRow.date,
        exit_date: exitRow.date, strike: contract.strike, expiration: contract.expiration,
      });
      continue;
    }

    const entryPrice = entryFill(contract, fill);
    const exitPrice = exitFill(exitQuote, fill);
    const cost = entryPrice * multiplier + fill.fee_per_contract_per_side_usd;
    const proceeds = exitPrice * multiplier - fill.fee_per_contract_per_side_usd;
    const pnl = proceeds - cost;

    ledger.push({
      ...base,
      status: "filled",
      entry_date: entryRow.date,
      exit_date: exitRow.date,
      expiration: contract.expiration,
      strike: contract.strike,
      selection: picked.selection,
      entry_bid: contract.bid, entry_ask: contract.ask, entry_fill: round(entryPrice, 4),
      exit_bid: exitQuote.bid, exit_ask: exitQuote.ask, exit_fill: round(exitPrice, 4),
      fees: round(2 * fill.fee_per_contract_per_side_usd, 2),
      pnl_usd: round(pnl, 2),
      return_on_premium: round(pnl / cost),
      regime_trend: entryRow.sma != null && entryRow.adjClose > entryRow.sma ? "above_200dma" : "below_200dma",
      regime_vol: entryRow.vix != null && entryRow.vix >= 20 ? "vix_high" : "vix_low",
      strategy_version: strategy.version,
    });
    blockedUntilIndex = exitIndex;
  }
  return ledger;
}

export function summarize(ledger) {
  const filled = ledger.filter((t) => t.status === "filled");
  const rejections = {};
  for (const t of ledger) {
    if (t.status !== "filled") rejections[t.reason] = (rejections[t.reason] ?? 0) + 1;
  }
  if (!filled.length) return { trades: 0, rejections };
  const returns = filled.map((t) => t.return_on_premium);
  const wins = filled.filter((t) => t.pnl_usd > 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl_usd, 0);
  const grossLoss = filled.filter((t) => t.pnl_usd < 0).reduce((s, t) => s - t.pnl_usd, 0);
  const byRegime = {};
  for (const t of filled) {
    const key = `${t.regime_trend}/${t.regime_vol}`;
    byRegime[key] = byRegime[key] ?? { n: 0, total_pnl: 0 };
    byRegime[key].n += 1;
    byRegime[key].total_pnl = round(byRegime[key].total_pnl + t.pnl_usd, 2);
  }
  return {
    trades: filled.length,
    win_rate: round(wins.length / filled.length),
    total_pnl_usd: round(filled.reduce((s, t) => s + t.pnl_usd, 0), 2),
    avg_return_on_premium: round(mean(returns)),
    median_return_on_premium: round(median(returns)),
    profit_factor: grossLoss > 0 ? round(grossWin / grossLoss, 2) : null,
    by_regime: byRegime,
    rejections,
  };
}

// ── CLI ───────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const args = Object.fromEntries(
    process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=")),
  );
  if (!args.chains) {
    console.error("Usage: node engine/backtest-options.mjs --chains=path [--side=call|put] [--hold=5]");
    console.error("No historical option-chain data is bundled; see engine/README.md for the cheapest sources.");
    process.exit(1);
  }
  const strategy = loadStrategy();
  const side = args.side ?? strategy.options.side;
  const holdSessions = Number(args.hold ?? strategy.options.exit.hold_sessions);
  const enriched = enrich(loadJoinedSeries(), strategy);
  const signals = detectCohort(enriched, "full_gate", strategy);
  const chains = loadChains(args.chains);
  console.log(`Loaded chains for ${chains.size} quote dates; ${signals.length} full-gate signals; side=${side} hold=${holdSessions}s`);

  const ledger = runBacktest({ chains, side, holdSessions, strategy, enriched, signals });
  mkdirSync(OUT_DIR, { recursive: true });
  const columns = ["signal_date", "status", "reason", "side", "hold_sessions", "entry_date", "exit_date",
    "expiration", "strike", "selection", "entry_bid", "entry_ask", "entry_fill",
    "exit_bid", "exit_ask", "exit_fill", "fees", "pnl_usd", "return_on_premium",
    "regime_trend", "regime_vol", "strategy_version"];
  writeFileSync(join(OUT_DIR, "backtest_trades_v1.csv"), toCsv(ledger, columns));

  const summary = summarize(ledger);
  writeFileSync(join(OUT_DIR, "backtest_summary_v1.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log("Ledger: engine/out/backtest_trades_v1.csv");
  console.log("Summary:", JSON.stringify(summary, null, 2));
  if (summary.trades && summary.trades < 30) {
    console.log(`\nWARNING: only ${summary.trades} completed trades — below the 30-trade minimum promotion gate. Do not act on this result.`);
  }
}
