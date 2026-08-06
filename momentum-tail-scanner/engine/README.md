# Engine — reproducible research pipeline

This directory is the "vertical slice" recommended in `ENGINEERING_HANDOFF.md` §11:
a reproducible data layer, deterministic signal detection, a regenerated event
study, and a deterministic EOD options backtester with an auditable trade ledger.
It is plain Node (no dependencies) and entirely offline after the one fetch step.

## Commands

```bash
npm run engine:fetch      # download SPY (Yahoo), VIX + VIX3M (Cboe) with provenance manifest
npm run engine:signals    # detect signals, regenerate the event study -> engine/out/
npm run engine:test       # unit tests on synthetic fixtures (no network)
npm run engine:backtest -- --chains=path/to/chains.csv   # options backtest (needs chain data)
```

All strategy rules live in `strategy.v1.json` — every decision from handoff §6
is explicit there (entry timing, DTE window, strike selection, liquidity gates,
fill model, fees, exits, overlap policy). Change rules only by bumping the
version and adding a CHANGELOG entry.

## What the regenerated event study found (run of 2026-08-06)

The previously hardcoded UI statistics were **verified as genuine**. Regenerated
from raw data, the 5-session horizon of the full gate gives: 375 observations,
64.8% positive, +0.58% average forward move, 19.7% ±3% touch rate — against the
UI's hardcoded 395 / 64.1% / +0.57% / 22.3%. The small drift is data-vintage,
not fabrication.

Two corrections to the UI's framing:

1. **True coverage starts 2009-09-25**, not 1994 — Cboe's VIX3M history begins
   2009-09-18, so the term-structure condition cannot be evaluated earlier.
2. The 375 observations **overlap heavily** (signals cluster during selloffs).
   Non-overlapping trade counts: 196 (2-session hold), 170 (5-session),
   136 (10-session). At 170 trades the strategy clears the 100-trade evidence
   bar set in the handoff — *if* option chain history covering 2009→today is
   used. A 2012→today dataset still yields roughly 130.

## Options backtester

`backtest-options.mjs` replays full-gate signals chronologically, enters at the
**next session close** (the honest fill point for EOD data), selects the nearest
expiration 10–35 calendar days out (for a 5-session hold), picks the 0.50-delta
strike when deltas are present (nearest-ATM otherwise), applies liquidity gates
(bid > 0, spread ≤ max($0.10, 5% of mid), OI ≥ 100), fills at midpoint ± 25% of
the half-spread, charges $0.65/contract/side, exits after the configured hold,
and blocks overlapping entries. Every decision lands in
`engine/out/backtest_trades_v1.csv` with the exact quotes used and a rejection
reason when a trade was refused. Nothing is bundled that could fake a result:
without real chain data the backtester refuses to run.

### Chain CSV schema

One file or a directory of files:

```
quote_date,expiration,strike,type,bid,ask,volume,open_interest[,delta][,iv]
2015-08-24,2015-09-18,190,call,8.10,8.45,1200,15000,0.52,0.31
```

ISO dates, `type` is `call`/`put`. ThetaData and Cboe DataShop EOD exports map
onto this with a column rename.

## Getting chain data (cheapest first)

| Source | Cost | Notes |
| --- | --- | --- |
| DoltHub `post-no-preference/options` | $0 | Community EOD chains ~2020+; fine for smoke-testing the pipeline, not for conclusions |
| ThetaData (1 month of options standard tier) | ~$40–80 once | Bulk-download SPY EOD NBBO back to ~2012, then cancel |
| Cboe DataShop EOD option quotes, SPY only | ~$50–200 once | Official data, pick the date range, own it forever |
| ORATS API (1 month) | ~$99 once | Highest quality; IV + Greeks included, history to 2007 |

Recommendation: smoke-test with DoltHub, then buy once (ThetaData or DataShop)
covering **2009-09-25 → today** so the full 170-trade sample is usable.
Intraday data is unnecessary — signals are computed at the close and entries are
next-session closes.

## Deliberately not built yet

Live feeds, streaming, paper trading, and brokerage execution — per the
handoff's phase plan, none of that is worth building until this backtest, run on
real chain data, shows a net edge that survives regime splits.
