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
async function history(url) {
  const rawDays = Number.parseInt(url.searchParams.get("days") || "90", 10);
  const days = Math.min(Math.max(rawDays || 90, 1), 365);
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);
  const endpoint = `https://api.frankfurter.app/${formatDate(start)}..${formatDate(end)}?from=CNY&to=JPY`;
  try {
    const res = await fetch(endpoint, { cf: { cacheTtl: 21600, cacheEverything: true } });
    if (!res.ok) throw new Error(`upstream responded ${res.status}`);
    const data = await res.json();
    const points = Object.entries(data.rates || {}).map(([date, rates]) => ({ date, rate: rates.JPY })).filter(p => typeof p.rate === "number").sort((a, b) => a.date.localeCompare(b.date));
    return json({ points, source: "ECB via Frankfurter" }, 200, { "cache-control": "public, max-age=21600" });
  } catch { return json({ error: "历史数据获取失败", points: [] }, 502); }
}

async function mastercard(url) {
  const direction = url.searchParams.get("direction") === "jpy2cny" ? "jpy2cny" : "cny2jpy";
  const amount = url.searchParams.get("amount") || "1";
  const transCurr = direction === "cny2jpy" ? "CNY" : "JPY";
  const billCurr = direction === "cny2jpy" ? "JPY" : "CNY";
  const fxDate = new Date().toISOString().slice(0, 10);
  const endpoint = `https://www.mastercard.us/settlement/currencyrate/conversion-rate?fxDate=${fxDate}&transCurr=${transCurr}&crdhldBillCurr=${billCurr}&bankFee=0&transAmt=${encodeURIComponent(amount)}`;
  try {
    const res = await fetch(endpoint, { headers: { "user-agent": "Mozilla/5.0 (compatible; personal-rate-page/1.0)", accept: "application/json" } });
    if (!res.ok) throw new Error(`mastercard responded ${res.status}`);
    return json({ ok: true, data: await res.json() }, 200, { "cache-control": "public, max-age=1800" });
  } catch {
    return json({ ok: false, error: "Mastercard 参考汇率暂时无法获取（该接口未公开，可能已限制访问）" });
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
