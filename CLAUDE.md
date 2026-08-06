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
- Variant findings (engine/research-variants.mjs, 2026-08-06): contango leg costs expectancy (backwardation signals were the best cohort); RSI(2)<10 weakens this gate; IBS<0.2 mildly helps at 2–5 sessions; exit on first close > SMA5 (cap 10) gives 70.1% win at 2.6-session avg hold vs 58.8% for fixed 5. Literature review with sources: momentum-tail-scanner/docs/LITERATURE_REVIEW.md. Evidence-ranked next steps: short put spreads / call debit spreads over long calls; non-overlapping stats only.

## Working agreements
- PR #2 (branch `claude/trader-app-gc085o`) is the active integration branch; keep it green and update it rather than opening parallel PRs.
- This repo has no CI configured (as of 2026-08).
