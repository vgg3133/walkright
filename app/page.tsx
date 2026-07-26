"use client";

import { useState } from "react";

type Tab = "signals" | "research" | "backtests" | "data";
type Horizon = 2 | 3 | 5 | 10 | 15;

type HorizonStats = {
  n: number;
  up: number;
  touch: number;
  upTouch: number;
  downTouch: number;
  average: number;
  volEdge: number;
};

type Condition = {
  id: string;
  label: string;
  menuLabel: string;
  description: string;
  stats: Record<Horizon, HorizonStats>;
};

type YearTrade = {
  signal: string;
  entry: string;
  exit: string;
  setup: number;
  result: number;
};

const HORIZONS: Horizon[] = [2, 3, 5, 10, 15];

const CONDITIONS: Condition[] = [
  {
    id: "current",
    label: "Current setup",
    menuLabel: "Current setup · decline + trend + VIX",
    description:
      "SPY fell at least 1% in 3 sessions, stayed above its 200-day average, VIX rose more than 5%, and VIX remained below VIX3M.",
    stats: {
      2: { n: 395, up: 57.5, touch: 5.3, upTouch: 2.3, downTouch: 3.0, average: 0.17, volEdge: -29.1 },
      3: { n: 395, up: 61.5, touch: 11.4, upTouch: 5.6, downTouch: 5.8, average: 0.30, volEdge: -28.4 },
      5: { n: 395, up: 64.1, touch: 22.3, upTouch: 11.9, downTouch: 10.6, average: 0.57, volEdge: -28.0 },
      10: { n: 394, up: 65.5, touch: 54.3, upTouch: 35.0, downTouch: 20.6, average: 1.00, volEdge: -27.9 },
      15: { n: 394, up: 70.1, touch: 75.1, upTouch: 48.0, downTouch: 29.9, average: 1.33, volEdge: -29.5 },
    },
  },
  {
    id: "all",
    label: "All market days",
    menuLabel: "Baseline · all market days",
    description:
      "The unconditional SPY baseline. Use this to see whether a pattern adds information beyond an ordinary market day.",
    stats: {
      2: { n: 8192, up: 56.6, touch: 11.2, upTouch: 4.9, downTouch: 6.6, average: 0.09, volEdge: -37.8 },
      3: { n: 8191, up: 57.9, touch: 17.9, upTouch: 8.2, downTouch: 10.4, average: 0.14, volEdge: -33.6 },
      5: { n: 8189, up: 58.8, touch: 30.3, upTouch: 14.3, downTouch: 17.2, average: 0.23, volEdge: -30.0 },
      10: { n: 8184, up: 61.9, touch: 52.7, upTouch: 28.8, downTouch: 27.9, average: 0.46, volEdge: -27.4 },
      15: { n: 8179, up: 64.1, touch: 67.7, upTouch: 40.2, downTouch: 34.6, average: 0.69, volEdge: -26.4 },
    },
  },
  {
    id: "down1",
    label: "3-day decline ≥ 1%",
    menuLabel: "SPY down ≥1% in 3 sessions",
    description:
      "Every historical session where SPY's cumulative 3-session return was negative 1% or worse.",
    stats: {
      2: { n: 1760, up: 56.4, touch: 23.3, upTouch: 12.1, downTouch: 12.0, average: 0.23, volEdge: -24.6 },
      3: { n: 1760, up: 59.1, touch: 34.0, upTouch: 18.6, downTouch: 17.4, average: 0.36, volEdge: -21.4 },
      5: { n: 1759, up: 60.8, touch: 50.8, upTouch: 29.4, downTouch: 24.8, average: 0.57, volEdge: -20.8 },
      10: { n: 1758, up: 61.8, touch: 75.1, upTouch: 47.7, downTouch: 36.4, average: 0.88, volEdge: -21.8 },
      15: { n: 1758, up: 63.6, touch: 86.6, upTouch: 56.7, downTouch: 43.6, average: 1.14, volEdge: -22.9 },
    },
  },
  {
    id: "down2",
    label: "3-day decline ≥ 2%",
    menuLabel: "SPY down ≥2% in 3 sessions",
    description:
      "A more severe 3-session selloff. The smaller sample is offset by a larger historical move-magnitude signal.",
    stats: {
      2: { n: 850, up: 57.1, touch: 35.8, upTouch: 19.5, downTouch: 18.0, average: 0.34, volEdge: -22.9 },
      3: { n: 850, up: 59.6, touch: 47.2, upTouch: 27.8, downTouch: 23.5, average: 0.48, volEdge: -17.9 },
      5: { n: 850, up: 61.9, touch: 63.3, upTouch: 39.4, downTouch: 30.5, average: 0.78, volEdge: -17.7 },
      10: { n: 850, up: 61.6, touch: 83.8, upTouch: 56.1, downTouch: 42.2, average: 1.05, volEdge: -19.1 },
      15: { n: 850, up: 62.6, touch: 92.1, upTouch: 64.1, downTouch: 48.0, average: 1.30, volEdge: -21.0 },
    },
  },
  {
    id: "down3",
    label: "3-day decline ≥ 3%",
    menuLabel: "SPY down ≥3% in 3 sessions",
    description:
      "The high-stress selloff cohort. It historically predicts larger subsequent ranges more clearly than direction.",
    stats: {
      2: { n: 397, up: 59.2, touch: 48.9, upTouch: 28.2, downTouch: 24.2, average: 0.44, volEdge: -17.4 },
      3: { n: 397, up: 61.2, touch: 60.7, upTouch: 36.8, downTouch: 31.2, average: 0.62, volEdge: -15.8 },
      5: { n: 397, up: 60.2, touch: 75.6, upTouch: 47.9, downTouch: 38.8, average: 0.82, volEdge: -13.1 },
      10: { n: 397, up: 62.5, touch: 92.9, upTouch: 65.2, downTouch: 50.1, average: 1.29, volEdge: -13.3 },
      15: { n: 397, up: 64.0, touch: 96.7, upTouch: 70.5, downTouch: 54.9, average: 1.70, volEdge: -15.5 },
    },
  },
  {
    id: "down3trend",
    label: "3-day decline ≥ 3% · uptrend",
    menuLabel: "Down ≥3% · above 200-day average",
    description:
      "A sharp pullback while SPY remained above its 200-day moving average—a buy-the-dip rather than bear-regime filter.",
    stats: {
      2: { n: 113, up: 66.4, touch: 31.0, upTouch: 22.1, downTouch: 10.6, average: 0.62, volEdge: -23.0 },
      3: { n: 113, up: 62.8, touch: 46.0, upTouch: 32.7, downTouch: 15.0, average: 0.90, volEdge: -19.2 },
      5: { n: 113, up: 69.0, touch: 59.3, upTouch: 44.2, downTouch: 17.7, average: 1.29, volEdge: -22.7 },
      10: { n: 113, up: 67.3, touch: 85.8, upTouch: 62.8, downTouch: 29.2, average: 1.77, volEdge: -21.7 },
      15: { n: 113, up: 69.0, touch: 94.7, upTouch: 70.8, downTouch: 34.5, average: 1.86, volEdge: -25.1 },
    },
  },
  {
    id: "down1bear",
    label: "3-day decline ≥ 1% · below trend",
    menuLabel: "Down ≥1% · below 200-day average",
    description:
      "A selloff inside a weaker long-term regime. Direction remains mixed even as subsequent ranges expand.",
    stats: {
      2: { n: 748, up: 53.9, touch: 40.4, upTouch: 21.3, downTouch: 20.9, average: 0.22, volEdge: -18.0 },
      3: { n: 748, up: 57.8, touch: 52.7, upTouch: 29.0, downTouch: 28.2, average: 0.33, volEdge: -15.3 },
      5: { n: 748, up: 57.6, touch: 71.1, upTouch: 41.2, downTouch: 37.6, average: 0.48, volEdge: -14.7 },
      10: { n: 748, up: 57.5, touch: 89.6, upTouch: 57.0, downTouch: 50.7, average: 0.72, volEdge: -15.3 },
      15: { n: 748, up: 58.3, touch: 95.9, upTouch: 63.0, downTouch: 57.5, average: 0.86, volEdge: -16.2 },
    },
  },
];

const PRICE_DATA = [
  { date: "May 13", value: 740.40 }, { date: "May 14", value: 746.25 },
  { date: "May 15", value: 737.27 }, { date: "May 18", value: 736.75 },
  { date: "May 19", value: 731.84 }, { date: "May 20", value: 739.35 },
  { date: "May 21", value: 740.81 }, { date: "May 22", value: 743.72 },
  { date: "May 26", value: 748.66 }, { date: "May 27", value: 748.53 },
  { date: "May 28", value: 752.66 }, { date: "May 29", value: 754.54 },
  { date: "Jun 01", value: 756.59 }, { date: "Jun 02", value: 757.62 },
  { date: "Jun 03", value: 752.30 }, { date: "Jun 04", value: 755.14 },
  { date: "Jun 05", value: 735.65 }, { date: "Jun 08", value: 737.32 },
  { date: "Jun 09", value: 735.16 }, { date: "Jun 10", value: 723.57 },
  { date: "Jun 11", value: 735.86 }, { date: "Jun 12", value: 739.84 },
  { date: "Jun 15", value: 752.89 }, { date: "Jun 16", value: 748.40 },
  { date: "Jun 17", value: 739.06 }, { date: "Jun 18", value: 746.74 },
  { date: "Jun 22", value: 744.39 }, { date: "Jun 23", value: 733.58 },
  { date: "Jun 24", value: 733.24 }, { date: "Jun 25", value: 734.30 },
  { date: "Jun 26", value: 728.99 }, { date: "Jun 29", value: 741.00 },
  { date: "Jun 30", value: 746.77 }, { date: "Jul 01", value: 745.76 },
  { date: "Jul 02", value: 744.78 }, { date: "Jul 06", value: 751.28 },
  { date: "Jul 07", value: 747.71 }, { date: "Jul 08", value: 745.40 },
  { date: "Jul 09", value: 751.71 }, { date: "Jul 10", value: 754.95 },
  { date: "Jul 13", value: 749.17 }, { date: "Jul 14", value: 751.83 },
  { date: "Jul 15", value: 754.81 }, { date: "Jul 16", value: 750.72 },
  { date: "Jul 17", value: 743.29 }, { date: "Jul 20", value: 742.09 },
  { date: "Jul 21", value: 748.28 }, { date: "Jul 22", value: 747.41 },
  { date: "Jul 23", value: 738.18 }, { date: "Jul 24", value: 738.93 },
];

const ANALOGS = [
  { date: "Jun 25, 2026", setup: -1.36, day5: 1.43, day10: 2.81 },
  { date: "Jun 9, 2026", setup: -2.65, day5: 1.80, day10: -0.26 },
  { date: "Jun 8, 2026", setup: -1.99, day5: 2.11, day10: -0.51 },
  { date: "Jun 5, 2026", setup: -2.90, day5: 0.57, day10: 1.19 },
  { date: "Mar 13, 2026", setup: -2.20, day5: -1.80, day10: -4.00 },
  { date: "Feb 13, 2026", setup: -1.50, day5: 0.09, day10: 0.68 },
];

const YEAR_BACKTEST = {
  start: "Jul 24, 2025",
  end: "Jul 24, 2026",
  sessions: 252,
  benchmark: 16.47,
  currentReturn: -0.69,
  winRate: 33.3,
  maxDrawdown: -1.19,
  trades: 3,
  candidateReturn: 1.67,
  candidateTrades: 2,
  variants: [
    { hold: 2, trades: 3, winRate: 33.3, result: -2.32, verdict: "Reject" },
    { hold: 3, trades: 3, winRate: 33.3, result: -2.39, verdict: "Reject" },
    { hold: 5, trades: 3, winRate: 33.3, result: -0.69, verdict: "Current" },
    { hold: 10, trades: 2, winRate: 100, result: 1.67, verdict: "Paper test" },
    { hold: 15, trades: 1, winRate: 0, result: -0.42, verdict: "Too thin" },
  ],
  tradeLog: [
    { signal: "Jun 5, 2026", entry: "Jun 8", exit: "Jun 12", setup: -2.90, result: -0.32 },
    { signal: "Jun 24, 2026", entry: "Jun 25", exit: "Jul 1", setup: -1.81, result: 0.83 },
    { signal: "Jul 17, 2026", entry: "Jul 20", exit: "Jul 24", setup: -1.14, result: -1.19 },
  ] satisfies YearTrade[],
};

function signed(value: number, digits = 1) {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function OutcomeGauge({ up }: { up: number }) {
  const down = 100 - up;
  return (
    <div className="gauge-wrap" aria-label={`${up.toFixed(1)} percent up outcomes and ${down.toFixed(1)} percent down outcomes`}>
      <svg className="gauge" viewBox="0 0 220 124" role="img" aria-hidden="true">
        <path className="gauge-track" d="M 24 106 A 86 86 0 0 1 196 106" pathLength="100" />
        <path
          className="gauge-up"
          d="M 24 106 A 86 86 0 0 1 196 106"
          pathLength="100"
          style={{ strokeDasharray: `${up} ${100 - up}` }}
        />
        <line x1="110" y1="18" x2="110" y2="32" className="gauge-gate" />
      </svg>
      <div className="gauge-numbers">
        <div>
          <span className="gauge-label blue">Up</span>
          <strong>{up.toFixed(1)}%</strong>
        </div>
        <div className="align-right">
          <span className="gauge-label coral">Down</span>
          <strong>{down.toFixed(1)}%</strong>
        </div>
      </div>
      <span className="gauge-threshold">70% watch threshold</span>
    </div>
  );
}

function PriceChart({ horizon }: { horizon: Horizon }) {
  const width = 900;
  const height = 286;
  const pad = { left: 48, right: 122, top: 26, bottom: 38 };
  const last = PRICE_DATA.at(-1)!.value;
  const upLevel = last * 1.03;
  const downLevel = last * 0.97;
  const values = PRICE_DATA.map((point) => point.value);
  const yMin = Math.floor(Math.min(...values, downLevel) - 4);
  const yMax = Math.ceil(Math.max(...values, upLevel) + 4);
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  const xFor = (index: number) => pad.left + (index / (PRICE_DATA.length - 1)) * chartWidth;
  const yFor = (value: number) => pad.top + ((yMax - value) / (yMax - yMin)) * chartHeight;
  const points = PRICE_DATA.map((point, index) => `${xFor(index)},${yFor(point.value)}`).join(" ");
  const area = `${pad.left},${pad.top + chartHeight} ${points} ${pad.left + chartWidth},${pad.top + chartHeight}`;
  const currentX = pad.left + chartWidth;
  const futureX = width - 20;
  const ticks = [yMin, Math.round(yMin + (yMax - yMin) / 3), Math.round(yMin + ((yMax - yMin) * 2) / 3), yMax];

  return (
    <div className="chart-shell">
      <div className="chart-head">
        <div>
          <p className="eyebrow">SPY price context</p>
          <h3>Recent tape &amp; ±3% test levels</h3>
        </div>
        <div className="chart-legend" aria-label="Chart legend">
          <span><i className="legend-line" />Adjusted close</span>
          <span><i className="legend-band" />Test zone</span>
        </div>
      </div>
      <svg className="price-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="SPY adjusted closing prices from May 13 to July 24, 2026, with plus and minus 3 percent test levels">
        <defs>
          <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3d9bff" stopOpacity=".22" />
            <stop offset="100%" stopColor="#3d9bff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="testFill" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#3d9bff" stopOpacity=".12" />
            <stop offset="100%" stopColor="#3d9bff" stopOpacity=".02" />
          </linearGradient>
        </defs>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={pad.left} x2={futureX} y1={yFor(tick)} y2={yFor(tick)} className="chart-grid" />
            <text x={pad.left - 10} y={yFor(tick) + 4} textAnchor="end" className="axis-label">{tick}</text>
          </g>
        ))}
        <polygon points={area} fill="url(#priceFill)" />
        <rect x={currentX} y={yFor(upLevel)} width={futureX - currentX} height={yFor(downLevel) - yFor(upLevel)} fill="url(#testFill)" />
        <line x1={currentX} x2={futureX} y1={yFor(upLevel)} y2={yFor(upLevel)} className="target-line target-up" />
        <line x1={currentX} x2={futureX} y1={yFor(downLevel)} y2={yFor(downLevel)} className="target-line target-down" />
        <line x1={currentX} x2={currentX} y1={pad.top} y2={pad.top + chartHeight} className="now-line" />
        <polyline points={points} className="price-line" />
        <circle cx={currentX} cy={yFor(last)} r="5" className="price-dot" />
        <text x={futureX} y={yFor(upLevel) - 7} textAnchor="end" className="target-label up-label">+3% · {upLevel.toFixed(2)}</text>
        <text x={futureX} y={yFor(downLevel) + 17} textAnchor="end" className="target-label down-label">−3% · {downLevel.toFixed(2)}</text>
        <text x={currentX - 8} y={height - 12} textAnchor="end" className="axis-label">Jul 24</text>
        <text x={futureX} y={height - 12} textAnchor="end" className="axis-label">+{horizon} sessions</text>
      </svg>
      <div className="chart-note">
        <span className="info-mark">i</span>
        The shaded area marks the test window between ±3% levels. It is not a price forecast.
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  note,
  tone = "neutral",
}: {
  label: string;
  value: string;
  note: string;
  tone?: "neutral" | "blue" | "coral";
}) {
  return (
    <article className={`metric-card ${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{note}</span>
    </article>
  );
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("signals");
  const [conditionId, setConditionId] = useState("current");
  const [horizon, setHorizon] = useState<Horizon>(5);
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const [callWeight, setCallWeight] = useState(70);
  const [startingCapital, setStartingCapital] = useState(10_000);

  const condition = CONDITIONS.find((item) => item.id === conditionId) ?? CONDITIONS[0];
  const stats = condition.stats[horizon];
  const down = 100 - stats.up;
  const setupIsLive = ["current", "all", "down1"].includes(conditionId);

  const decision = (() => {
    if (!setupIsLive) {
      return {
        label: "SETUP INACTIVE",
        tone: "neutral",
        reason: `Today's −1.25% 3-session move does not meet this pattern. The statistics remain available for research.`,
      };
    }
    if (stats.n < 100) {
      return { label: "NO TRADE", tone: "neutral", reason: "The sample does not clear the 100-observation reliability gate." };
    }
    if (stats.up >= 70) {
      return { label: "CALL WATCH", tone: "blue", reason: "Direction clears 70/30, but live option pricing still needs to validate the entry." };
    }
    if (down >= 70) {
      return { label: "PUT WATCH", tone: "coral", reason: "Direction clears 70/30, but live option pricing still needs to validate the entry." };
    }
    return { label: "NO TRADE", tone: "neutral", reason: "Direction stays below 70/30, and the volatility proxy does not support paying up for premium." };
  })();

  const setActiveTab = (next: Tab) => {
    setTab(next);
    window.setTimeout(() => {
      document.querySelector("main")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setActiveTab("signals")} aria-label="Momentum Tail Scanner home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>Momentum <b>Tail Scanner</b></span>
        </button>
        <nav className="primary-nav" aria-label="Primary navigation">
          {(["signals", "research", "backtests", "data"] as Tab[]).map((item) => (
            <button key={item} className={tab === item ? "active" : ""} onClick={() => setActiveTab(item)}>
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </nav>
        <div className="top-actions">
          <label className="symbol-select">
            <span>Instrument</span>
            <select aria-label="Instrument" defaultValue="SPY">
              <option>SPY</option>
              <option disabled>QQQ · coming next</option>
            </select>
          </label>
          <button className="icon-button" onClick={() => setMethodologyOpen(true)} aria-label="Open methodology">
            ?
          </button>
        </div>
      </header>

      <main>
        <section className="page-intro">
          <div>
            <p className="eyebrow">
              {tab === "data" ? "Feed architecture · read-only first" : "Event study · SPY daily bars since 1994"}
            </p>
            <h1>
              {tab === "signals"
                ? "Signal cockpit"
                : tab === "research"
                  ? "Pattern research"
                  : tab === "backtests"
                    ? "Backtest explorer"
                    : "Live data connection"}
            </h1>
            <p className="intro-copy">
              {tab === "signals"
                ? "Separate direction, move magnitude, and option cost before risking capital."
                : tab === "research"
                  ? "See what short selloffs historically predicted—and what they did not."
                  : tab === "backtests"
                    ? "Interrogate every horizon, sample size, and recent analog behind the headline."
                    : "Connect the underlying tape and the option chain without exposing credentials or enabling orders."}
            </p>
          </div>
          <div className="as-of">
            <span className={`live-dot ${tab === "data" ? "offline" : ""}`} />
            <div>
              <small>{tab === "data" ? "Connection status" : "Latest completed session"}</small>
              <strong>{tab === "data" ? "Awaiting provider" : "Jul 24, 2026"}</strong>
            </div>
          </div>
        </section>

        {tab !== "data" && (
          <section className="control-rack" aria-label="Backtest controls">
            <label className="condition-control">
              <span>Pattern</span>
              <select aria-label="Pattern" value={conditionId} onChange={(event) => setConditionId(event.target.value)}>
                {CONDITIONS.map((item) => <option key={item.id} value={item.id}>{item.menuLabel}</option>)}
              </select>
            </label>
            <div className="horizon-control">
              <span>Forward horizon</span>
              <div className="horizon-pills">
                {HORIZONS.map((days) => (
                  <button key={days} onClick={() => setHorizon(days)} className={horizon === days ? "active" : ""}>
                    {days}D
                  </button>
                ))}
              </div>
            </div>
            <div className="sample-pill">
              <span>Sample</span>
              <strong>{stats.n.toLocaleString()} observations</strong>
            </div>
          </section>
        )}

        {tab === "signals" && (
          <div className="tab-panel">
            <section className="signal-grid">
              <article className="decision-card panel">
                <div className="decision-copy">
                  <div className="decision-heading">
                    <div>
                      <p className="eyebrow">Decision gate</p>
                      <h2 className={`decision ${decision.tone}`}>{decision.label}</h2>
                    </div>
                    <span className="research-only">Research only</span>
                  </div>
                  <p className="decision-reason">{decision.reason}</p>
                  <div className="gate-row">
                    <span className={setupIsLive ? "passed" : ""}>
                      <i>{setupIsLive ? "✓" : "×"}</i> setup active
                    </span>
                    <span className={Math.max(stats.up, down) >= 70 ? "passed" : ""}>
                      <i>{Math.max(stats.up, down) >= 70 ? "✓" : "×"}</i> 70/30 direction
                    </span>
                    <span className={stats.n >= 100 ? "passed" : ""}>
                      <i>{stats.n >= 100 ? "✓" : "×"}</i> sample ≥ 100
                    </span>
                    <span>
                      <i>×</i> live chain
                    </span>
                  </div>
                </div>
                <OutcomeGauge up={stats.up} />
              </article>

              <aside className="snapshot-card panel">
                <div className="panel-title">
                  <div>
                    <p className="eyebrow">Market snapshot</p>
                    <h2>Regime inputs</h2>
                  </div>
                  <span className={`status-chip ${setupIsLive ? "" : "inactive"}`}>
                    {setupIsLive ? "Live match" : "Study only"}
                  </span>
                </div>
                <div className="snapshot-list">
                  <div>
                    <span>SPY</span>
                    <strong>738.93</strong>
                    <em className="positive">+0.10%</em>
                  </div>
                  <div>
                    <span>3-session move</span>
                    <strong>−1.25%</strong>
                    <em className="negative">Trigger</em>
                  </div>
                  <div>
                    <span>VIX</span>
                    <strong>18.58</strong>
                    <em className="negative">+8.97% / 3D</em>
                  </div>
                  <div>
                    <span>VIX9D / VIX3M</span>
                    <strong>17.62 / 20.51</strong>
                    <em className="positive">Contango</em>
                  </div>
                </div>
                <div className="regime-chips">
                  <span>Above 200D</span>
                  <span>Vol rising</span>
                  <span>Term structure normal</span>
                </div>
              </aside>
            </section>

            <section className="metric-grid" aria-label="Signal metrics">
              <MetricCard label="±3% touch" value={`${stats.touch.toFixed(1)}%`} note={`Either side within ${horizon} sessions`} tone="blue" />
              <MetricCard label="+3% touch" value={`${stats.upTouch.toFixed(1)}%`} note="Intraperiod upside threshold" />
              <MetricCard label="−3% touch" value={`${stats.downTouch.toFixed(1)}%`} note="Intraperiod downside threshold" tone="coral" />
              <MetricCard label="IV proxy edge" value={signed(stats.volEdge)} note="Realized-vol proxy vs current VIX" tone="coral" />
            </section>

            <section className="lower-grid">
              <PriceChart horizon={horizon} />
              <aside className="pattern-card panel">
                <p className="eyebrow">Active pattern</p>
                <h2>{condition.label}</h2>
                <p>{condition.description}</p>
                <dl className="compact-stats">
                  <div><dt>Average forward return</dt><dd className="positive">{signed(stats.average, 2)}</dd></div>
                  <div><dt>Positive outcomes</dt><dd>{stats.up.toFixed(1)}%</dd></div>
                  <div><dt>Negative outcomes</dt><dd>{down.toFixed(1)}%</dd></div>
                </dl>
                <div className="warning-box">
                  <span>!</span>
                  <p><strong>Option quote feed not connected.</strong> IV proxy is not option P&amp;L and excludes skew, theta, spread, and commissions.</p>
                </div>
                <button className="text-button" onClick={() => setMethodologyOpen(true)}>Read methodology <span>→</span></button>
              </aside>
            </section>
          </div>
        )}

        {tab === "research" && (
          <div className="tab-panel research-panel">
            <section className="research-hero panel">
              <div>
                <p className="eyebrow">The useful distinction</p>
                <h2>Selloffs predict range better than direction.</h2>
                <p>
                  A 3-session decline did not create a reliable “big drop is next” rule in this sample.
                  As the initial selloff deepened, the chance of touching ±3% rose sharply—but positive
                  forward returns still outnumbered negative ones.
                </p>
              </div>
              <div className="research-callout">
                <span>5-day result after a ≥3% selloff</span>
                <strong>75.6%</strong>
                <small>touched either ±3% level</small>
                <div><b>60.2%</b> finished higher</div>
              </div>
            </section>

            <section className="pattern-comparison">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Severity study</p>
                  <h2>Five-session outcomes</h2>
                </div>
                <span>Adjusted SPY · overlapping events</span>
              </div>
              <div className="comparison-grid">
                {CONDITIONS.filter((item) => ["all", "down1", "down2", "down3"].includes(item.id)).map((item) => {
                  const itemStats = item.stats[5];
                  return (
                    <article key={item.id} className="comparison-card panel">
                      <span>{item.label}</span>
                      <strong>{itemStats.touch.toFixed(1)}%</strong>
                      <p>±3% touch</p>
                      <div className="mini-bar"><i style={{ width: `${itemStats.touch}%` }} /></div>
                      <dl>
                        <div><dt>Up outcome</dt><dd>{itemStats.up.toFixed(1)}%</dd></div>
                        <div><dt>Avg return</dt><dd>{signed(itemStats.average, 2)}</dd></div>
                        <div><dt>Sample</dt><dd>{itemStats.n.toLocaleString()}</dd></div>
                      </dl>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="research-grid">
              <article className="panel lesson-card">
                <span className="lesson-number">01</span>
                <h3>Direction needs its own gate</h3>
                <p>A high chance of a large move does not tell you which option side to own. The cockpit keeps direction and magnitude separate.</p>
              </article>
              <article className="panel lesson-card">
                <span className="lesson-number">02</span>
                <h3>Option cost can erase the pattern</h3>
                <p>Long calls and puts need a move larger than what implied volatility, theta, skew, and the bid–ask spread already price in.</p>
              </article>
              <article className="panel lesson-card">
                <span className="lesson-number">03</span>
                <h3>Valuation is context, not timing</h3>
                <p>The low-PEG article can inform the longer-term backdrop, but a forecast-dependent valuation ratio is not a 2-to-15-day entry trigger.</p>
              </article>
            </section>

            <section className="workflow-card panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Proposed workflow</p>
                  <h2>Four gates before an options entry</h2>
                </div>
              </div>
              <ol className="workflow">
                <li><span>1</span><div><strong>Pattern</strong><p>Define the exact selloff and regime.</p></div></li>
                <li><span>2</span><div><strong>Direction</strong><p>Require the historical 70/30 threshold.</p></div></li>
                <li><span>3</span><div><strong>Magnitude</strong><p>Compare target-touch odds with the chosen expiry.</p></div></li>
                <li><span>4</span><div><strong>Price</strong><p>Validate IV, skew, theta, spread, and max loss.</p></div></li>
              </ol>
            </section>
          </div>
        )}

        {tab === "backtests" && (
          <div className="tab-panel backtest-panel">
            <section className="year-test panel">
              <div className="year-test-head">
                <div>
                  <p className="eyebrow">Executable one-year proxy</p>
                  <h2>What the current rule actually earned</h2>
                  <p>
                    Next-open entry, five-session hold, no overlapping trades, and 0.10% round-trip
                    cost. This tests SPY shares—not options—because historical chains are not connected.
                  </p>
                </div>
                <div className="capital-control" aria-label="Starting capital">
                  <span>Starting capital</span>
                  <div>
                    {[10_000, 25_000, 50_000].map((amount) => (
                      <button
                        key={amount}
                        className={startingCapital === amount ? "active" : ""}
                        onClick={() => setStartingCapital(amount)}
                      >
                        ${(amount / 1_000).toFixed(0)}k
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="year-kpis">
                <article>
                  <span>Strategy return</span>
                  <strong className="negative">{signed(YEAR_BACKTEST.currentReturn, 2)}</strong>
                  <small>
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                      maximumFractionDigits: 0,
                    }).format(startingCapital * YEAR_BACKTEST.currentReturn / 100)}
                  </small>
                </article>
                <article>
                  <span>SPY price return</span>
                  <strong className="positive">{signed(YEAR_BACKTEST.benchmark, 2)}</strong>
                  <small>
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                      maximumFractionDigits: 0,
                    }).format(startingCapital * YEAR_BACKTEST.benchmark / 100)}
                  </small>
                </article>
                <article>
                  <span>Completed trades</span>
                  <strong>{YEAR_BACKTEST.trades}</strong>
                  <small>{YEAR_BACKTEST.winRate.toFixed(1)}% win rate</small>
                </article>
                <article>
                  <span>Closed-trade drawdown</span>
                  <strong className="negative">{signed(YEAR_BACKTEST.maxDrawdown, 2)}</strong>
                  <small>{YEAR_BACKTEST.sessions} market sessions</small>
                </article>
              </div>

              <div className="strategy-verdict">
                <div className="verdict-label">
                  <span>Strategy decision</span>
                  <strong>DO NOT PROMOTE LIVE</strong>
                </div>
                <div className="verdict-copy">
                  <h3>Change the hold test—not the entry filter.</h3>
                  <p>
                    The five-day version lost money and badly trailed passive SPY. A ten-session hold
                    produced <b>{signed(YEAR_BACKTEST.candidateReturn, 2)}</b>, but only across
                    {" "}{YEAR_BACKTEST.candidateTrades} trades. Keep the current entry definition,
                    reject 2–3 day exits, and paper-test 10 days until at least 10 out-of-sample trades
                    complete. No option trade should pass without real strike, IV, spread, and theta data.
                  </p>
                </div>
              </div>
            </section>

            <section className="backtest-review-grid">
              <article className="table-card panel">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Sensitivity check</p>
                    <h2>Same signal, different exits</h2>
                  </div>
                  <span>Net of 0.10% per round trip</span>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr><th>Hold</th><th>Trades</th><th>Win rate</th><th>Return</th><th>Decision</th></tr>
                    </thead>
                    <tbody>
                      {YEAR_BACKTEST.variants.map((variant) => (
                        <tr key={variant.hold} className={variant.hold === 10 ? "candidate-row" : ""}>
                          <td>{variant.hold} sessions</td>
                          <td>{variant.trades}</td>
                          <td>{variant.winRate.toFixed(1)}%</td>
                          <td className={variant.result >= 0 ? "positive" : "negative"}>{signed(variant.result, 2)}</td>
                          <td><span className={`verdict-chip ${variant.hold === 10 ? "candidate" : ""}`}>{variant.verdict}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="table-card panel">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Current five-day rule</p>
                    <h2>Every completed trade</h2>
                  </div>
                  <span>{YEAR_BACKTEST.start} – {YEAR_BACKTEST.end}</span>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr><th>Signal</th><th>3D move</th><th>Entry</th><th>Exit</th><th>Net result</th></tr>
                    </thead>
                    <tbody>
                      {YEAR_BACKTEST.tradeLog.map((trade) => (
                        <tr key={trade.signal}>
                          <td>{trade.signal}</td>
                          <td className="negative">{signed(trade.setup, 2)}</td>
                          <td>{trade.entry}</td>
                          <td>{trade.exit}</td>
                          <td className={trade.result >= 0 ? "positive" : "negative"}>{signed(trade.result, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            </section>

            <section className="table-card panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Horizon matrix</p>
                  <h2>{condition.label}</h2>
                </div>
                <span>{condition.stats[2].n.toLocaleString()} earliest-window observations</span>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Horizon</th>
                      <th>Sample</th>
                      <th>Up</th>
                      <th>Down</th>
                      <th>±3% touch</th>
                      <th>+3% touch</th>
                      <th>−3% touch</th>
                      <th>Avg return</th>
                      <th>IV proxy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {HORIZONS.map((days) => {
                      const row = condition.stats[days];
                      return (
                        <tr key={days} className={horizon === days ? "selected-row" : ""} onClick={() => setHorizon(days)}>
                          <td><button onClick={() => setHorizon(days)}>{days} sessions</button></td>
                          <td>{row.n.toLocaleString()}</td>
                          <td className="blue-text">{row.up.toFixed(1)}%</td>
                          <td className="coral-text">{(100 - row.up).toFixed(1)}%</td>
                          <td>{row.touch.toFixed(1)}%</td>
                          <td>{row.upTouch.toFixed(1)}%</td>
                          <td>{row.downTouch.toFixed(1)}%</td>
                          <td className={row.average >= 0 ? "positive" : "negative"}>{signed(row.average, 2)}</td>
                          <td className={row.volEdge >= 0 ? "positive" : "negative"}>{signed(row.volEdge)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="table-footnote">Click a row to make it the active horizon throughout the dashboard.</p>
            </section>

            <section className="backtest-lower">
              <article className="table-card panel">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Current-setup analogs</p>
                    <h2>Recent completed events</h2>
                  </div>
                  <span>Most recent first</span>
                </div>
                <div className="table-scroll">
                  <table className="analog-table">
                    <thead><tr><th>Signal date</th><th>3D setup</th><th>Next 5D</th><th>Next 10D</th></tr></thead>
                    <tbody>
                      {ANALOGS.map((row) => (
                        <tr key={row.date}>
                          <td>{row.date}</td>
                          <td className="negative">{signed(row.setup, 2)}</td>
                          <td className={row.day5 >= 0 ? "positive" : "negative"}>{signed(row.day5, 2)}</td>
                          <td className={row.day10 >= 0 ? "positive" : "negative"}>{signed(row.day10, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>

              <aside className="allocation-card panel">
                <p className="eyebrow">70/30 research sketch</p>
                <h2>Directional allocation</h2>
                <p>Visualize a call/put split without implying expected option returns.</p>
                <div className="allocation-number"><strong>{callWeight}%</strong><span>call side</span></div>
                <input
                  aria-label="Call-side allocation"
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={callWeight}
                  onChange={(event) => setCallWeight(Number(event.target.value))}
                  style={{ "--allocation": `${callWeight}%` } as React.CSSProperties}
                />
                <div className="allocation-labels"><span>Calls {callWeight}%</span><span>Puts {100 - callWeight}%</span></div>
                <div className="allocation-bar"><i style={{ width: `${callWeight}%` }} /><b style={{ width: `${100 - callWeight}%` }} /></div>
                <button className="secondary-button" onClick={() => setCallWeight(Math.round(stats.up / 5) * 5)}>
                  Match historical direction
                </button>
                <small>No P&amp;L estimate until live strikes, expiry, IV, and spreads are connected.</small>
              </aside>
            </section>

            <section className="method-strip">
              <div><span>Profit-test window</span><strong>Jul 24, 2025 – Jul 24, 2026</strong></div>
              <div><span>Execution</span><strong>Next open → exit close</strong></div>
              <div><span>Capital</span><strong>One position · no overlap</strong></div>
              <div><span>Costs</span><strong>0.10% round trip</strong></div>
              <button onClick={() => setMethodologyOpen(true)}>Full methodology →</button>
            </section>
          </div>
        )}

        {tab === "data" && (
          <div className="tab-panel data-panel">
            <section className="data-hero panel">
              <div>
                <p className="eyebrow">My recommendation</p>
                <h2>Use Massive for pricing. Add Tradier later for execution.</h2>
                <p>
                  Massive is the cleanest fit for this research-heavy scanner because it provides
                  live and historical stock and OPRA options data through REST, WebSockets, and flat
                  files. Keep the first connection read-only. A broker connection should come only
                  after the strategy survives a real options backtest and paper trading.
                </p>
                <div className="data-actions">
                  <a href="https://massive.com/options" target="_blank" rel="noreferrer">Massive options plans ↗</a>
                  <a href="https://massive.com/docs/options/getting-started" target="_blank" rel="noreferrer">API documentation ↗</a>
                </div>
              </div>
              <aside className="answer-card">
                <span>Do we need option prices?</span>
                <strong>YES</strong>
                <p>
                  SPY prices can trigger a setup. They cannot tell us whether a call or put is
                  overpriced, liquid, or profitable after spread and time decay.
                </p>
              </aside>
            </section>

            <section className="feed-grid">
              <article className="feed-card panel">
                <div className="feed-title">
                  <span className="feed-number">01</span>
                  <div>
                    <p className="eyebrow">Underlying feed</p>
                    <h2>Needed to detect the signal</h2>
                  </div>
                  <span className="required-chip">Required</span>
                </div>
                <ul className="field-list">
                  <li><span>SPY</span><strong>Live bid, ask, last, volume and bars</strong></li>
                  <li><span>Volatility</span><strong>VIX, VIX9D and VIX3M values</strong></li>
                  <li><span>History</span><strong>Daily and intraday OHLCV</strong></li>
                  <li><span>Integrity</span><strong>Exchange timestamp and stale-data flag</strong></li>
                </ul>
                <p className="feed-footnote">This layer can produce “setup active” or “no setup.” It should not produce an option trade.</p>
              </article>

              <article className="feed-card panel option-feed">
                <div className="feed-title">
                  <span className="feed-number">02</span>
                  <div>
                    <p className="eyebrow">Options feed</p>
                    <h2>Needed to price the trade</h2>
                  </div>
                  <span className="required-chip coral">Non-negotiable</span>
                </div>
                <ul className="field-list">
                  <li><span>Quote</span><strong>NBBO bid, ask, sizes and timestamp</strong></li>
                  <li><span>Contract</span><strong>Strike, expiry, type and multiplier</strong></li>
                  <li><span>Risk</span><strong>IV, delta, gamma, theta and vega</strong></li>
                  <li><span>Liquidity</span><strong>Volume, open interest and spread</strong></li>
                </ul>
                <p className="feed-footnote">Historical versions of these fields are also required to replace the SPY-share proxy with a real options P&amp;L backtest.</p>
              </article>
            </section>

            <section className="connection-card panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Secure connection</p>
                  <h2>How the pricing reaches this dashboard</h2>
                </div>
                <span>API key stays server-side</span>
              </div>
              <ol className="connection-flow">
                <li><span>1</span><div><strong>Market-data provider</strong><p>Massive REST for snapshots and history; WebSocket for live quotes.</p></div></li>
                <li><span>2</span><div><strong>Private server route</strong><p>The hosted secret is never sent to the browser or committed in code.</p></div></li>
                <li><span>3</span><div><strong>Strategy engine</strong><p>Normalize timestamps, reject stale quotes and calculate the four gates.</p></div></li>
                <li><span>4</span><div><strong>Scanner display</strong><p>Show the selected contract, price, max loss and why it passed or failed.</p></div></li>
              </ol>
            </section>

            <section className="provider-grid">
              <article className="provider-card panel recommended">
                <div className="provider-top">
                  <span>Best for this app</span>
                  <strong>Massive</strong>
                </div>
                <p>Best single data source for current quotes plus historical options research.</p>
                <dl>
                  <div><dt>Prototype</dt><dd>Delayed plans</dd></div>
                  <div><dt>Live validation</dt><dd>Advanced real-time plan</dd></div>
                  <div><dt>Historical quotes</dt><dd>OPRA data from Mar 2022</dd></div>
                </dl>
              </article>
              <article className="provider-card panel">
                <div className="provider-top">
                  <span>Best low-cost live path</span>
                  <strong>Tradier</strong>
                </div>
                <p>Real-time stocks and options for brokerage account holders, with chains and hourly Greeks.</p>
                <dl>
                  <div><dt>Strength</dt><dd>Live data + orders</dd></div>
                  <div><dt>Use first</dt><dd>Paper trading only</dd></div>
                  <div><dt>Limitation</dt><dd>Weaker history layer</dd></div>
                </dl>
                <a href="https://docs.tradier.com/docs/market-data" target="_blank" rel="noreferrer">Tradier market data ↗</a>
              </article>
              <article className="provider-card panel">
                <div className="provider-top">
                  <span>Good all-in-one alternative</span>
                  <strong>Alpaca</strong>
                </div>
                <p>OPRA streaming plus paper trading, but its historical option data starts in February 2024.</p>
                <dl>
                  <div><dt>Strength</dt><dd>Data + paper account</dd></div>
                  <div><dt>Live feed</dt><dd>WebSocket OPRA</dd></div>
                  <div><dt>History</dt><dd>Since Feb 2024</dd></div>
                </dl>
                <a href="https://docs.alpaca.markets/us/docs/real-time-option-data" target="_blank" rel="noreferrer">Alpaca options feed ↗</a>
              </article>
            </section>

            <section className="next-step panel">
              <div>
                <p className="eyebrow">What happens next</p>
                <h2>Start delayed, prove the plumbing, then pay for real time.</h2>
              </div>
              <ol>
                <li><span>01</span><p>Create a Massive account and choose a delayed options plan for integration testing.</p></li>
                <li><span>02</span><p>Add the API key as a hosted secret—not in the page, repository, or chat.</p></li>
                <li><span>03</span><p>Connect SPY snapshots and one filtered option chain, then verify timestamps and spreads.</p></li>
                <li><span>04</span><p>Load historical option quotes, rerun the one-year backtest, and upgrade to real time only if the edge survives.</p></li>
              </ol>
            </section>
          </div>
        )}
      </main>

      <footer>
        <span>Momentum Tail Scanner · research prototype</span>
        <p>Educational analysis only. Not investment advice or a recommendation to trade.</p>
        <button onClick={() => setMethodologyOpen(true)}>Methodology</button>
      </footer>

      {methodologyOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setMethodologyOpen(false)}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="methodology-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setMethodologyOpen(false)} aria-label="Close methodology">×</button>
            <p className="eyebrow">Read before using</p>
            <h2 id="methodology-title">Methodology &amp; limitations</h2>
            <div className="modal-content">
              <div>
                <strong>Data</strong>
                <p>Adjusted SPY daily OHLC history from January 1994 through July 24, 2026. VIX-family series begin when each index became available.</p>
              </div>
              <div>
                <strong>Event study</strong>
                <p>Each qualifying day is an observation. Forward windows overlap, so sample counts are not counts of independent trades. “Up” compares the future close with the signal close.</p>
              </div>
              <div>
                <strong>Touch rate</strong>
                <p>Uses subsequent daily highs and lows to test whether SPY touched +3% or −3% within the selected horizon. Either-side rate can include events that touched both.</p>
              </div>
              <div>
                <strong>IV proxy</strong>
                <p>Compares a simple forward realized-volatility measure with contemporaneous VIX. It is a rough diagnostic—not an options backtest or expected return.</p>
              </div>
              <div>
                <strong>One-year profit proxy</strong>
                <p>Uses unadjusted SPY daily OHLC bars from July 24, 2025 through July 24, 2026. A signal enters at the next open, exits at the selected closing horizon, prevents overlapping positions, and subtracts 0.10% round trip. Dividends, taxes, and market impact are excluded.</p>
              </div>
              <div>
                <strong>Missing from v1</strong>
                <p>Live strikes, expirations, IV surface, skew, theta, bid–ask spreads, commissions, slippage, liquidity filters, position sizing, and portfolio risk.</p>
              </div>
              <div>
                <strong>Decision rule</strong>
                <p>“Watch” requires at least 100 observations and 70% historical direction. It still requires a live option-chain check. “No trade” is the default when gates are incomplete.</p>
              </div>
            </div>
            <button className="primary-button" onClick={() => setMethodologyOpen(false)}>I understand</button>
          </section>
        </div>
      )}
    </div>
  );
}
