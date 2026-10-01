const PRIMARY = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/cny.json";
const MIRROR = "https://latest.currency-api.pages.dev/v1/currencies/cny.json";

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", ...extraHeaders },
  });
}

async function fetchRateSource(url) {
  const res = await fetch(url, { cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!res.ok) throw new Error(`upstream responded ${res.status}`);
  const data = await res.json();
  const cnyToJpy = data.cny?.jpy;
  if (!cnyToJpy) throw new Error("unexpected response shape");
  return { date: data.date, cnyToJpy };
}

async function rate() {
  let result, source = "currency-api";
  try { result = await fetchRateSource(PRIMARY); }
  catch {
    try { result = await fetchRateSource(MIRROR); source = "currency-api (mirror)"; }
    catch { return json({ error: "汇率获取失败，请稍后再试" }, 502); }
  }
  return json({ date: result.date, cny_to_jpy: result.cnyToJpy, jpy_to_cny: 1 / result.cnyToJpy, source, fetched_at: new Date().toISOString() }, 200, { "cache-control": "public, max-age=3600" });
}

function formatDate(date) { return date.toISOString().slice(0, 10); }

// Frankfurter moved to api.frankfurter.dev (v1 uses base/symbols). The old
// api.frankfurter.app host used from/to, so it is kept only as a fallback.
async function fetchHistory(endpoint) {
  const res = await fetch(endpoint, { headers: { accept: "application/json" }, cf: { cacheTtl: 21600, cacheEverything: true } });
  if (!res.ok) throw new Error(`upstream responded ${res.status}`);
  const data = await res.json();
  // Guard: if a host ignores our params it answers with EUR-based rates, which would plot as a wrong curve.
  if (String(data.base).toUpperCase() !== "CNY") throw new Error("unexpected base currency");
  const points = Object.entries(data.rates || {}).map(([date, rates]) => ({ date, rate: rates.JPY })).filter(p => typeof p.rate === "number").sort((a, b) => a.date.localeCompare(b.date));
  if (!points.length) throw new Error("no data points");
  return points;
}

// Intraday quotes come from Yahoo Finance's public chart endpoint (CNYJPY=X).
// It is unofficial and answers 429 to requests without a browser-like UA.
// FX trades around the clock on weekdays; on weekends range=1d can come back
// nearly empty, so we fall back to 5 days and keep the last 24h of data.
const YAHOO_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
const YAHOO_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

async function fetchIntraday(host, range, interval) {
  const res = await fetch(`https://${host}/v8/finance/chart/CNYJPY=X?range=${range}&interval=${interval}`, {
    headers: { "user-agent": YAHOO_UA, accept: "application/json" },
    signal: AbortSignal.timeout(8000),
    cf: { cacheTtl: 300, cacheEverything: true },
  });
  if (!res.ok) throw new Error(`upstream responded ${res.status}`);
  const result = (await res.json()).chart?.result?.[0];
  const stamps = result?.timestamp || [];
  const closes = result?.indicators?.quote?.[0]?.close || [];
  const points = stamps
    .map((t, i) => ({ t, rate: closes[i] }))
    .filter(p => typeof p.rate === "number" && p.rate > 0);
  if (!points.length) return [];
  const last = points[points.length - 1].t;
  return points.filter(p => p.t >= last - 86400).map(p => ({ date: new Date(p.t * 1000).toISOString(), rate: p.rate }));
}

async function intraday() {
  for (const host of YAHOO_HOSTS) {
    for (const [range, interval] of [["1d", "5m"], ["5d", "15m"]]) {
      try {
        const points = await fetchIntraday(host, range, interval);
        if (points.length >= 2) return json({ points, intraday: true, source: "Yahoo Finance" }, 200, { "cache-control": "public, max-age=300" });
      } catch { /* try the next option */ }
    }
  }
  return json({ error: "当天分时数据获取失败", points: [] }, 502);
}

async function history(url) {
  const rawDays = Number.parseInt(url.searchParams.get("days") || "90", 10);
  const days = Math.min(Math.max(rawDays || 90, 1), 365);
  if (days === 1) return intraday();
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);
  const range = `${formatDate(start)}..${formatDate(end)}`;
  const endpoints = [
    `https://api.frankfurter.dev/v1/${range}?base=CNY&symbols=JPY`,
    `https://api.frankfurter.app/${range}?from=CNY&to=JPY`,
  ];
  for (const endpoint of endpoints) {
    try {
      const points = await fetchHistory(endpoint);
      return json({ points, source: "ECB via Frankfurter" }, 200, { "cache-control": "public, max-age=21600" });
    } catch { /* try the next host */ }
  }
  return json({ error: "历史数据获取失败", points: [] }, 502);
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
