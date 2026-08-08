# Literature review — dip-buy gate (SPY −1%/3s, >200DMA, VIX +5%/3s, VIX<VIX3M)

Compiled 2026-08-06 from published and practitioner sources. Every claim carries
its source URL. Peer-reviewed items are marked; treat blog-grade items as
weaker evidence. Cross-checks against our own regenerated statistics are in
`engine/out/research_variants_v1.json`.

## 1. Short-term mean reversion in equity indices

- Connors RSI(2) with a 200DMA filter still tests positive in recent
  replications (~0.9% avg gain/trade; the 200DMA filter raises per-trade gain
  and cuts drawdown at the cost of time-in-market).
  https://www.quantifiedstrategies.com/rsi-2-strategy/ ·
  https://www.quantifiedstrategies.com/rsi2-on-spy/
- Index mean reversion emerged ~1983, was inverted before then, and has been
  broadly stable since the mid-2000s; edges on individual stocks decayed more
  than on the index. https://alvarezquanttrading.com/blog/mean-reversion-vs-trend-following-through-the-years/
- Entry refinements that test well in the literature: RSI(2) < 10
  (https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/rsi-2),
  cumulative RSI (https://www.quantitativo.com/p/squeezing-more-profits-with-cumulative),
  consecutive down days above the 200DMA (stocks, 1995–2006 sample:
  https://tradingmarkets.com/recent/if_a_stock_drops_5_days_in_a_row_should_you_buy_it-674228),
  and — strongest paper-grade — IBS < 0.2 (Pagonidis, "The IBS Effect", NAAIM
  2013: +0.35% next-day at IBS<0.2 vs −0.13% at IBS>0.8;
  https://www.naaim.org/wp-content/uploads/2014/04/00V_Alexander_Pagonidis_The-IBS-Effect-Mean-Reversion-in-Equity-ETFs-1.pdf ·
  https://jonathankinlay.com/2019/07/the-internal-bar-strength-indicator/ ·
  https://alvarezquanttrading.com/blog/internal-bar-strength-for-mean-reversion/).
  **Our data check:** RSI(2)<10 on top of our gate WEAKENS it (+0.31% vs +0.54%
  at 5s); IBS<0.2 mildly helps at 2–5 sessions (+0.28%/+0.60% vs +0.19%/+0.54%)
  on a halved sample.
- Exits: indicator exits (close > 5-day MA, RSI(2) > 65–80) beat fixed time
  exits; 7–10 session time stop as backstop.
  https://alvarezquanttrading.com/blog/the-abcs-of-creating-a-mean-reversion-strategy-part-2/ ·
  https://alvarezquanttrading.com/blog/n-day-exits-with-mean-reversion/
  **Our data check:** confirmed — first close above SMA5 (cap 10): 70.1% win,
  2.6-session avg hold vs 58.8% win at fixed 5 sessions.

## 2. VIX spikes and term structure

- Simon & Campasano, "The VIX Futures Basis", *Journal of Derivatives* 2014
  (peer-reviewed): the basis forecasts VIX futures returns (a harvestable risk
  premium), not spot VIX direction.
  https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2094510
- VIX stretch >20% above its 10-day MA: 89% of instances saw SPX exceed the
  trigger close within 4 days; edge dies beyond ~1 week.
  https://quantifiableedges.com/20-vix-stretch-provides-upside-edge/ ·
  Hanna, "Chicken and Egg" (SSRN): https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4808230
- The Connors "VIX Stretch" published setup is a close cousin of our gate.
  https://easylanguagemastery.com/strategies/vix-stretch/
- Contango prevails ~92% of days and persisted through the 2022 bear — the
  VIX<VIX3M leg is NOT bear-market protection.
  https://www.thetrading.tools/vix-term-structure · https://www.systemtrader.co/tools/vix
  **Our data check:** the contango leg costs expectancy — removing it adds 96
  backwardation signals averaging +1.01% at 5s (best cohort in the study).
- VIX reverts fast after spikes (~78% lower within 10 days after >30 closes;
  half-life ~15 sessions). https://www.ipresage.com/research/vix-mean-reversion ·
  https://www.macroption.com/is-volatility-mean-reverting/
- Vol risk premium averages 2–4 vol points and widens to ~8–15 after fear
  spikes — consistent with our measured realized-vol-28%-below-VIX.
  https://quantpedia.com/strategies/volatility-risk-premium-effect ·
  https://www.newyorkfed.org/medialibrary/media/research/staff_reports/sr867.pdf

## 3. Options expression (the structure question)

- Israelov, "Pathetic Protection", *J. Alternative Investments* 2019
  (peer-reviewed): long index options carry negatively due to the VRP.
  https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2934538
- Bondarenko, Cboe PUT-index study (32+ years): put-writing matched S&P
  returns at materially lower vol; premium capture largest when IV elevated.
  https://cdn.cboe.com/resources/education/research_publications/PutWriteCBOE19_v14_by_Prof_Oleg_Bondarenko_as_of_June_14.pdf
- ORATS backtested selling 2-week 30Δ/15Δ SPY put credit spreads on VIX
  spikes profitably. https://orats.com/blog/sell-put-spread-when-vix-spikes-exit-based-on-max-profit
- Ranked expressions for this signal per the evidence: (1) short put spread /
  cash-secured put, (2) call debit spread (vega-flat), (3) outright long calls
  — worst-supported, fighting the post-spike VRP.

## 4. Reading the quants — public positioning sources

- 13F (free, EDGAR): quarterly, 45-day lag, long-only — useless at our
  horizon. https://legalclarity.org/13f-sec-filings-requirements-and-public-access/
- CFTC COT / TFF (free, weekly, ~3-day lag): ES + VIX futures positioning by
  dealer/leveraged-fund/asset-manager.
  https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm ·
  https://www.macroption.com/vix-cot/
- Put/call ratios: Pan & Poteshman (*RFS* 2006, peer-reviewed) found
  predictability, but only with buy-to-open classified volume (paid); public
  aggregates are noisy.
- Dealer gamma (GEX): Barbon & Buraschi "Gamma Fragility" (SSRN 2020) —
  negative dealer gamma → momentum/fragility, positive → pinning.
  https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3725454 — computable
  ourselves from the chain data we plan to purchase (OI + IV by strike).
  Vendors: SqueezeMetrics (free DIX/GEX history), SpotGamma (paid).
- Strategy catalogs: Quantpedia (~70 free / 900+ paid) https://quantpedia.com/screener ·
  SSRN (free) · Concretum papers https://concretumgroup.com/papers/

## 5. Known pitfalls

- Overlapping-window inference is inflated (Boudoukh et al., *FAJ* 2019:
  naive long-horizon overlap rejects a true null ~20% of the time).
  https://www.tandfonline.com/doi/full/10.1080/0015198X.2018.1547056
  → headline stats must use the 170 non-overlapping events or block bootstrap.
- Regime dependence: failure mode is signals firing just above a failing
  200DMA (Aug 2015, Oct 2018, early 2022); the contango leg did not screen
  2022. Guard: require non-negative 200DMA slope.
  **Our data check:** the rising-200DMA guard excluded only 7 of 375 signals
  post-2009 with unchanged stats — cheap insurance, untestable protection in
  this sample.
- AQR "Hold the Dip" (2025): 196 longer-horizon buy-the-dip variants
  underperformed passive on average — kills the naive framing; short-horizon
  Connors-style MR is a different animal but inherits the crowded-reversal
  left tail. https://advisoranalyst.com/2026/07/27/hold-the-dip-aqr-makes-the-case-against-the-markets-most-popular-mantra.html/
- Canonical Connors rules carry no stops (stops tested as hurting expectancy)
  → rare large left-tail trades; low time-in-market caps standalone CAGR.

## Top 5 actionable refinements (evidence-ranked, cross-checked)

1. Express the trade short-vol (short put spread) or vega-flat (call debit
   spread), not long calls. [peer-reviewed VRP stack + our −28% RV/IV measure]
2. Use non-overlapping events for all headline statistics. [peer-reviewed]
3. Exit on strength (close > SMA5 or RSI(2) > 65) with a 7–10 session time
   stop. [practitioner, confirmed on our data: 70.1% win @ 2.6 sessions]
4. Consider IBS < 0.2 as an intensity filter at 2–5 session holds. [paper-grade,
   mildly confirmed on our data; RSI(2) — rejected on our data]
5. Drop or soften the contango leg; add a rising-200DMA guard instead.
   [practitioner + our data: contango leg costs expectancy]
