const START = "09/01/2024";
const END = "07/24/2026";
const TEST_START = "2025-07-24";
const ROUND_TRIP_COST = 0.001;

const spyUrl =
  "https://www.marketwatch.com/investing/fund/spy/downloaddatapartial" +
  `?csvdownload=true&daterange=d730&downloadpartial=false&enddate=${encodeURIComponent(END + " 23:59:59")}` +
  `&frequency=p1d&newdates=false&startdate=${encodeURIComponent(START + " 00:00:00")}`;

const VIX_URL = "https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv";
const VIX3M_URL = "https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX3M_History.csv";

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else current += char;
  }
  values.push(current);
  return values;
}

function toIso(value) {
  const [month, day, year] = value.split("/");
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

async function getText(url) {
  const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!response.ok) throw new Error(`${response.status} fetching ${url}`);
  return response.text();
}

function parseSpy(text) {
  return text.trim().split(/\r?\n/).slice(1).map((line) => {
    const [date, open, high, low, close, volume] = parseCsvLine(line);
    return {
      date: toIso(date),
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: Number(volume.replaceAll(",", "")),
    };
  }).sort((a, b) => a.date.localeCompare(b.date));
}

function parseCboe(text) {
  return new Map(
    text.trim().split(/\r?\n/).slice(1).map((line) => {
      const [date, , , , close] = parseCsvLine(line);
      return [toIso(date), Number(close)];
    }),
  );
}

function maxDrawdown(returns) {
  let equity = 1;
  let peak = 1;
  let drawdown = 0;
  for (const value of returns) {
    equity *= 1 + value;
    peak = Math.max(peak, equity);
    drawdown = Math.min(drawdown, equity / peak - 1);
  }
  return drawdown;
}

function run(rows, vix, vix3m, config) {
  const trades = [];
  let blockedUntil = -1;

  for (let index = 200; index < rows.length - config.hold; index += 1) {
    const row = rows[index];
    if (row.date < TEST_START || index <= blockedUntil) continue;

    const decline = row.close / rows[index - 3].close - 1;
    const sma200 = rows.slice(index - 199, index + 1).reduce((sum, item) => sum + item.close, 0) / 200;
    const vixNow = vix.get(row.date);
    const vixThen = vix.get(rows[index - 3].date);
    const vix3mNow = vix3m.get(row.date);
    if (!vixNow || !vixThen || !vix3mNow) continue;

    const matches =
      decline <= -config.decline &&
      (!config.trend || row.close > sma200) &&
      vixNow / vixThen - 1 > config.vixRise &&
      (!config.contango || vixNow < vix3mNow);
    if (!matches) continue;

    const entry = rows[index + 1];
    const exit = rows[index + config.hold];
    const gross = exit.close / entry.open - 1;
    const net = gross - ROUND_TRIP_COST;
    trades.push({
      signal: row.date,
      entry: entry.date,
      exit: exit.date,
      setup: decline,
      entryPrice: entry.open,
      exitPrice: exit.close,
      net,
    });
    blockedUntil = index + config.hold;
  }

  const returns = trades.map((trade) => trade.net);
  const compounded = returns.reduce((equity, value) => equity * (1 + value), 1) - 1;
  const wins = returns.filter((value) => value > 0).length;
  const averageWin = returns.filter((value) => value > 0).reduce((a, b) => a + b, 0) / Math.max(1, wins);
  const losses = returns.filter((value) => value <= 0);
  const averageLoss = losses.reduce((a, b) => a + b, 0) / Math.max(1, losses.length);

  return {
    ...config,
    trades: trades.length,
    wins,
    winRate: trades.length ? wins / trades.length : 0,
    return: compounded,
    profit10k: 10_000 * compounded,
    averageTrade: trades.length ? returns.reduce((a, b) => a + b, 0) / trades.length : 0,
    averageWin,
    averageLoss,
    maxDrawdown: maxDrawdown(returns),
    tradeLog: trades,
  };
}

const [spyText, vixText, vix3mText] = await Promise.all([
  getText(spyUrl),
  getText(VIX_URL),
  getText(VIX3M_URL),
]);
const rows = parseSpy(spyText);
const vix = parseCboe(vixText);
const vix3m = parseCboe(vix3mText);

const base = { decline: 0.01, trend: true, vixRise: 0.05, contango: true };
const variants = [];
for (const decline of [0.01, 0.015, 0.02, 0.025, 0.03]) {
  for (const hold of [2, 3, 5, 10, 15]) {
    variants.push(run(rows, vix, vix3m, { ...base, decline, hold }));
  }
}

const current = variants.find((item) => item.decline === 0.01 && item.hold === 5);
const candidate = variants
  .filter((item) => item.trades >= 2)
  .sort((a, b) =>
    b.return - a.return ||
    b.winRate - a.winRate ||
    b.trades - a.trades,
  )[0];

const testRows = rows.filter((row) => row.date >= TEST_START);
const benchmark = testRows.at(-1).close / testRows[0].close - 1;

console.log(JSON.stringify({
  period: { start: testRows[0].date, end: testRows.at(-1).date, sessions: testRows.length },
  benchmark,
  current,
  candidate,
  variants: variants.sort((a, b) => b.return - a.return),
}, null, 2));
