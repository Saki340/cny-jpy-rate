// One data source for everything, so the board, the calculator and the chart
// always agree: Frankfurter (ECB reference rates, published once per working
// day). fawazahmed0's currency-api is only a fallback when Frankfurter fails.

// api.frankfurter.dev/v1 uses base/symbols; the old frankfurter.app host uses
// from/to and is kept as a second try.
const FRANKFURTER = [
  { root: "https://api.frankfurter.dev/v1", query: "base=CNY&symbols=JPY" },
  { root: "https://api.frankfurter.app", query: "from=CNY&to=JPY" },
];

// currency-api: jsDelivr first, Cloudflare Pages mirror second. `tag` is
// "latest" or a YYYY-MM-DD date.
const currencyApiUrls = (tag) => [
  `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${tag}/v1/currencies/cny.json`,
  `https://${tag}.currency-api.pages.dev/v1/currencies/cny.json`,
];

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", ...extraHeaders },
  });
}

async function getJson(url, cacheTtl) {
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8000),
    cf: { cacheTtl, cacheEverything: true },
  });
  if (!res.ok) throw new Error(`upstream responded ${res.status}`);
  return res.json();
}

async function firstOk(tasks) {
  for (const task of tasks) {
    try { return await task(); } catch { /* try the next one */ }
  }
  throw new Error("all sources failed");
}

// Guard: a host that ignores our params answers with EUR-based rates, which
// would show a wrong number, so the base currency is always checked.
function checkFrankfurter(data) {
  if (String(data.base).toUpperCase() !== "CNY") throw new Error("unexpected base currency");
  return data;
}

async function currencyApiOn(tag) {
  const data = await firstOk(currencyApiUrls(tag).map((url) => () => getJson(url, 3600)));
  const rate = data.cny?.jpy;
  if (typeof rate !== "number" || rate <= 0) throw new Error("unexpected response shape");
  return { date: data.date, rate };
}

/* ---------- /api/rate ---------- */

async function rate() {
  try {
    const data = await firstOk(FRANKFURTER.map((f) => async () => checkFrankfurter(await getJson(`${f.root}/latest?${f.query}`, 3600))));
    const cnyToJpy = data.rates?.JPY;
    if (typeof cnyToJpy !== "number") throw new Error("unexpected response shape");
    return rateResponse(data.date, cnyToJpy, "frankfurter");
  } catch { /* fall back */ }
  try {
    const { date, rate: cnyToJpy } = await currencyApiOn("latest");
    return rateResponse(date, cnyToJpy, "currency-api");
  } catch {
    return json({ error: "汇率获取失败，请稍后再试" }, 502);
  }
}

function rateResponse(date, cnyToJpy, source) {
  return json(
    { date, cny_to_jpy: cnyToJpy, jpy_to_cny: 1 / cnyToJpy, source, fetched_at: new Date().toISOString() },
    200,
    { "cache-control": "public, max-age=1800" },
  );
}

/* ---------- /api/history ---------- */

const isoDate = (d) => d.toISOString().slice(0, 10);

async function frankfurterHistory(range) {
  return firstOk(FRANKFURTER.map((f) => async () => {
    const data = checkFrankfurter(await getJson(`${f.root}/${range}?${f.query}`, 21600));
    const points = Object.entries(data.rates || {})
      .map(([date, rates]) => ({ date, rate: rates.JPY }))
      .filter((p) => typeof p.rate === "number")
      .sort((a, b) => a.date.localeCompare(b.date));
    if (points.length < 2) throw new Error("no data points");
    return points;
  }));
}

// currency-api only serves one day per request, so the fallback samples the
// range: at most 20 days (each may take two fetches), which keeps a request
// well under the Workers free-plan limit of 50 subrequests.
const FALLBACK_SAMPLES = 20;

async function currencyApiHistory(start, days) {
  const tags = new Set();
  for (let k = 0; k < FALLBACK_SAMPLES - 1; k++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + Math.round((k * days) / (FALLBACK_SAMPLES - 1)));
    tags.add(isoDate(d));
  }
  tags.add("latest");
  const results = await Promise.allSettled([...tags].map((tag) => currencyApiOn(tag)));
  const byDate = new Map();
  for (const r of results) if (r.status === "fulfilled") byDate.set(r.value.date, r.value.rate);
  const points = [...byDate].map(([date, rate]) => ({ date, rate })).sort((a, b) => a.date.localeCompare(b.date));
  if (points.length < 2) throw new Error("no data points");
  return points;
}

async function history(url) {
  const rawDays = Number.parseInt(url.searchParams.get("days") || "90", 10);
  const days = Math.min(Math.max(rawDays || 90, 7), 365);
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - days);
  const headers = { "cache-control": "public, max-age=21600" };
  try {
    const points = await frankfurterHistory(`${isoDate(start)}..${isoDate(end)}`);
    return json({ points, source: "frankfurter" }, 200, headers);
  } catch { /* fall back */ }
  try {
    const points = await currencyApiHistory(start, days);
    return json({ points, source: "currency-api" }, 200, headers);
  } catch {
    return json({ error: "历史数据获取失败", points: [] }, 502);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      if (request.method === "OPTIONS") return new Response(null, { headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS", "access-control-allow-headers": "content-type" } });
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405, { allow: "GET, OPTIONS" });
      if (url.pathname === "/api/rate") return rate();
      if (url.pathname === "/api/history") return history(url);
      return json({ error: "Not found" }, 404);
    }
    return env.ASSETS.fetch(request);
  },
};
