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

async function history(url) {
  const rawDays = Number.parseInt(url.searchParams.get("days") || "90", 10);
  const days = Math.min(Math.max(rawDays || 90, 1), 365);
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

// Mastercard has no public free API. This calls the internal endpoint used by
// the converter page on mastercard.com. The site sits behind Akamai Bot Manager,
// so requests from a server may be answered with 403; in that case we report
// why instead of pretending, and the page shows a link to the official tool.
const MC_PAGE = "https://www.mastercard.com/us/en/personal/get-support/currency-exchange-rate-converter.html";

async function mastercard(url) {
  const direction = url.searchParams.get("direction") === "jpy2cny" ? "jpy2cny" : "cny2jpy";
  const from = direction === "cny2jpy" ? "CNY" : "JPY"; // transaction currency
  const to = direction === "cny2jpy" ? "JPY" : "CNY";   // cardholder billing currency
  const endpoint = "https://www.mastercard.com/marketingservices/public/mccom-services/currency-conversions/conversion-rates" +
    `?exchange_date=0000-00-00&transaction_currency=${from}&cardholder_billing_currency=${to}&bank_fee=0&transaction_amount=1`;
  try {
    const res = await fetch(endpoint, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; personal-rate-page/1.0)", accept: "application/json", referer: MC_PAGE },
      signal: AbortSignal.timeout(8000),
    });
    const type = res.headers.get("content-type") || "";
    if (!res.ok || !type.includes("json")) {
      return json({ ok: false, reason: [401, 403, 429].includes(res.status) || !type.includes("json") ? "blocked" : "http", status: res.status });
    }
    const body = await res.json();
    const d = body.data || body;
    const rate = Number(d.conversionRate ?? d.conversion_rate);
    if (!Number.isFinite(rate) || rate <= 0) return json({ ok: false, reason: "unexpected", status: res.status });
    return json({ ok: true, from, to, rate, fx_date: d.fxDate || d.fx_date || null }, 200, { "cache-control": "public, max-age=1800" });
  } catch {
    return json({ ok: false, reason: "network" });
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
      if (url.pathname === "/api/mastercard") return mastercard(url);
      return json({ error: "Not found" }, 404);
    }
    return env.ASSETS.fetch(request);
  },
};
