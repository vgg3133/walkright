# WalkRight — project memory

## Owner preferences
- Personal-use products; keep costs minimal (free data first, one-time purchases over subscriptions).
- Target holding period for trading strategies: from a couple of days up to ~2–3 weeks (the 2/3/5/10/15-session horizons in the engine cover this).
- Use sub-agents where helpful (owner has explicitly approved).
- Owner communicates by voice-to-text; expect occasional transcription artifacts — interpret charitably and confirm when a word changes the meaning.

## Repository layout
- `trader/` — standalone single-file AI trading terminal (portfolio, dual bull/bear analysts, journal). Same style/API-key system as `interview-coach/`.
- `interview-coach/` — live response coach (Web Speech API + streaming LLM suggestions).
- `momentum-tail-scanner/` — SPY options scanner (Next.js UI imported via git subtree with full history) plus `engine/`, the reproducible research pipeline.

## Momentum Tail Scanner engine — key facts
- Strategy rules are frozen in `momentum-tail-scanner/engine/strategy.v1.json`. Never change rules silently: bump the version and record a CHANGELOG entry. Research variants go in separate scripts, not in the frozen spec.
- Commands (run inside `momentum-tail-scanner/`): `npm run engine:fetch | engine:signals | engine:test`, and `npm run engine:backtest -- --chains=<csv>`.
- Signal gate: SPY −1%/3 sessions, above 200DMA, VIX +5%/3 sessions, VIX < VIX3M. Evaluated at session close; options entry at NEXT session close (EOD-data constraint).
- Verified findings (2026-08-06 run): hardcoded UI stats were genuine (regenerated 375 obs / 64.8% up / +0.58% avg at 5 sessions vs UI's 395 / 64.1% / +0.57%). True gate coverage starts 2009-09-25 (VIX3M history begins then). Non-overlapping trades: 196/170/136 at 2/5/10-session holds — clears the 100-trade evidence bar.
- Realized vol runs ~28% below VIX after signals → IV-crush headwind for buying options; spread/short-premium structures are the open research question.
- Options backtester refuses to run without real chain data (no fake profitability, per ENGINEERING_HANDOFF.md ethos).
- Data purchase decision (pending owner): SPY EOD option chains 2009→today. Cheapest paths: Cboe DataShop one-time (~$50–200) or 1 month of ThetaData (~$40–80, covers ~2012+). Daily EOD data is sufficient; intraday is not needed.
- Free sources wired in: SPY daily via Yahoo chart API, VIX/VIX3M via Cboe CDN CSVs. Stooq is blocked from this environment.
- Variant findings (engine/research-variants.mjs, 2026-08-06): ICT-style daily "liquidity sweep" filter tested — sweep of prior 5d low HURTS the gate; the NO-sweep cohort (shallow orderly dips) is the strongest subsample found yet (76.9% up, +1.57% at 10s, n=104) but is post-hoc — needs out-of-sample confirmation before use. contango leg costs expectancy (backwardation signals were the best cohort); RSI(2)<10 weakens this gate; IBS<0.2 mildly helps at 2–5 sessions; exit on first close > SMA5 (cap 10) gives 70.1% win at 2.6-session avg hold vs 58.8% for fixed 5. Literature review with sources: momentum-tail-scanner/docs/LITERATURE_REVIEW.md. Evidence-ranked next steps: short put spreads / call debit spreads over long calls; non-overlapping stats only.

## Working agreements
- PR #2 (branch `claude/trader-app-gc085o`) is the active integration branch; keep it green and update it rather than opening parallel PRs.
- This repo has no CI configured (as of 2026-08).

## First real options backtest (free-tier ThetaData, 2023-06 -> 2026-08, long calls, 1 contract)
- Hold 2s: 44 trades, 56.8% win, PF 1.82, +$3,724 | Hold 5s: 37 trades, 45.9% win, PF 1.30, +$2,437 (median -10% — IV crush is real; top-2 winners carry the whole result) | Hold 10s: 31 trades, 58.1% win, PF 1.56, +$4,778.
- Structural read: long calls are net positive but fragile/tail-dependent, consistent with the VRP literature. Next engineering step: multi-leg support (call debit spreads, short put spreads) in backtester v1.1; next data step: $40-80 ThetaData month for 2016/2020+ regime variety.
- Theta Terminal runs fine in the CCR container (Java 21, proxy OK, creds in scratchpad only — never commit).
- Structure comparison (same data/fills, engine/backtest-structures.mjs): put credit spread 98%/94% at 5s hold = 84.2% win, PF 3.83, worst -$350, robust without top-2 winners (+$2,744) — most consistent structure; but ties up ~$2,100 margin per ~$90 avg profit. Call debit spread ~= long call returns at 10s with smaller risk/worst-case. Long calls best absolute $ but outlier-dependent. Short-spread holds beyond ~5s turn negative (PF 0.95 at 10s) — collect theta early, don't linger. Owner prefers avoiding spreads; presented data, decision theirs.
