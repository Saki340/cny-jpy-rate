const CURRENCY_API_URL = "https://github.com/fawazahmed0/exchange-api";

const state = {
  cnyToJpy: null,
  jpyToCny: null,
  direction: "cny2jpy", // or jpy2cny
  historyDays: 90,
  history: [], // [{ date, rate }] always stored as CNY -> JPY
  historyReq: 0,
  mc: {}, // Mastercard result per direction: { rate, date } or { error, status }
  mcReq: 0,
};

const el = (id) => document.getElementById(id);

function esc(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function debounce(fn, ms) {
  let timer = null;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

function fmt(n, maxDigits = 4) {
  if (!isFinite(n)) return "--";
  return n.toLocaleString("zh-CN", { maximumFractionDigits: maxDigits });
}

/* ---------- theme ---------- */

function applyTheme(theme) {
  const normalized = theme === "dark" ? "dark" : "light";
  if (window.mdui && typeof window.mdui.setTheme === "function") {
    window.mdui.setTheme(normalized);
  } else {
    document.documentElement.classList.toggle("mdui-theme-dark", normalized === "dark");
    document.documentElement.classList.toggle("mdui-theme-light", normalized === "light");
  }
  localStorage.setItem("theme", normalized);
  el("theme-toggle").checked = normalized === "dark";
  el("theme-toggle-label").textContent = normalized === "dark" ? "深色模式" : "浅色模式";
}

function initTheme() {
  const saved = localStorage.getItem("theme");
  const preferred = saved || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  applyTheme(preferred);
  el("theme-toggle").addEventListener("change", (e) => {
    applyTheme(e.target.checked ? "dark" : "light");
  });
}

/* ---------- rate board + calculator ---------- */

async function loadRate() {
  const boardNote = el("board-note");
  try {
    const res = await fetch("/api/rate");
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    state.cnyToJpy = data.cny_to_jpy;
    state.jpyToCny = data.jpy_to_cny;

    const updated = el("updated");
    updated.textContent = `数据日期 ${data.date} · 来源 `;
    const link = document.createElement("a");
    link.href = CURRENCY_API_URL;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "currency-api";
    updated.append(link);
    if (String(data.source).includes("mirror")) updated.append("（备用镜像）");

    renderRateLine();
    runCalculator();
  } catch (err) {
    boardNote.textContent = "汇率获取失败，请稍后刷新页面重试。";
  }
}

function currentPair() {
  return state.direction === "cny2jpy" ? ["CNY", "JPY"] : ["JPY", "CNY"];
}

function currentMidRate() {
  return state.direction === "cny2jpy" ? state.cnyToJpy : state.jpyToCny;
}

function renderRateLine() {
  const [from, to] = currentPair();
  const rate = currentMidRate();

  el("rate-line").innerHTML =
    `<span>1</span><span class="cur-from">${from}</span>` +
    `<span class="eq">=</span>` +
    `<span>${fmt(rate)}</span><span class="cur-to">${to}</span>`;

  el("calc-from-label").textContent = from;
  el("calc-to-label").textContent = to;
}

function toggleDirection() {
  state.direction = state.direction === "cny2jpy" ? "jpy2cny" : "cny2jpy";
  renderRateLine();
  runCalculator();
  renderChart();
  if (state.mc[state.direction]) renderMastercard();
  else loadMastercard();
}

function runCalculator() {
  renderMastercard(); // its converted amount follows the input too
  const amount = parseFloat(el("amount").value) || 0;
  const rate = currentMidRate();
  if (!rate) return;
  el("calc-result").textContent = fmt(amount * rate, 3);
}

/* ---------- history chart (plain SVG, no external library) ---------- */

function axisFmt(v) {
  return v >= 10 ? v.toFixed(2) : v >= 1 ? v.toFixed(3) : v.toFixed(5);
}

function pointFmt(v) {
  return v >= 1 ? v.toFixed(4) : v.toFixed(6);
}

async function loadHistory(days) {
  state.historyDays = days;
  document.querySelectorAll(".range-tabs .md-tab").forEach((b) => {
    const active = Number(b.dataset.days) === days;
    b.classList.toggle("md-tab-active", active);
    b.variant = active ? "tonal" : "outlined";
  });

  const token = ++state.historyReq;
  try {
    const res = await fetch(`/api/history?days=${days}`);
    const data = await res.json();
    if (token !== state.historyReq) return; // a newer tab click is already in flight
    if (!data.points || !data.points.length) throw new Error(data.error || "no points");
    state.history = data.points;
    renderChart();
  } catch (err) {
    if (token !== state.historyReq) return;
    state.history = [];
    el("chart-readout").textContent = "";
    el("history-chart").innerHTML = '<p class="chart-msg">历史走势暂时加载失败，请稍后刷新重试。</p>';
  }
}

function renderChart() {
  const pts = state.history;
  if (!pts.length) return;

  const wrap = el("history-chart");
  const [from, to] = currentPair();
  const inverse = state.direction === "jpy2cny";
  const values = pts.map((p) => (inverse ? 1 / p.rate : p.rate));

  const W = Math.max(wrap.clientWidth || 600, 260);
  const H = 220;
  const padL = 58, padR = 10, padT = 10, padB = 24;
  const n = pts.length;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || max * 0.01 || 1;
  const yMin = min - span * 0.1;
  const yMax = max + span * 0.1;

  const step = n > 1 ? (W - padL - padR) / (n - 1) : 0;
  const x = (i) => (n > 1 ? padL + i * step : padL + (W - padL - padR) / 2);
  const y = (v) => padT + ((yMax - v) * (H - padT - padB)) / (yMax - yMin);

  let grid = "";
  let labels = "";
  for (let k = 0; k < 4; k++) {
    const v = yMin + ((yMax - yMin) * k) / 3;
    const gy = y(v);
    grid += `<line class="chart-grid" x1="${padL}" x2="${W - padR}" y1="${gy.toFixed(1)}" y2="${gy.toFixed(1)}"/>`;
    labels += `<text class="chart-text" x="${padL - 6}" y="${(gy + 4).toFixed(1)}" text-anchor="end">${axisFmt(v)}</text>`;
  }

  const ticks = Math.min(5, n);
  for (let k = 0; k < ticks; k++) {
    const i = ticks === 1 ? 0 : Math.round((k * (n - 1)) / (ticks - 1));
    const anchor = k === 0 ? "start" : k === ticks - 1 ? "end" : "middle";
    labels += `<text class="chart-text" x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="${anchor}">${esc(pts[i].date.slice(5))}</text>`;
  }

  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(n - 1).toFixed(1)} ${H - padB} L${x(0).toFixed(1)} ${H - padB} Z`;

  wrap.innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="1 ${from} 兑 ${to} 的历史走势">` +
    grid +
    `<path class="chart-area" d="${area}"/>` +
    `<path class="chart-line" d="${line}"/>` +
    `<line class="chart-cursor" y1="${padT}" y2="${H - padB}" style="display:none"/>` +
    `<circle class="chart-dot" r="3.5" style="display:none"/>` +
    labels +
    `</svg>`;

  const svg = wrap.querySelector("svg");
  const cursor = svg.querySelector(".chart-cursor");
  const dot = svg.querySelector(".chart-dot");
  const readout = el("chart-readout");

  const describe = (i, latest) =>
    `${latest ? "最新 " : ""}${pts[i].date} · 1 ${from} = ${pointFmt(values[i])} ${to}`;

  readout.textContent = describe(n - 1, true);

  const showPoint = (evt) => {
    const rect = svg.getBoundingClientRect();
    const px = (evt.clientX - rect.left) * (W / (rect.width || W));
    const i = n > 1 ? Math.min(Math.max(Math.round((px - padL) / step), 0), n - 1) : 0;
    cursor.setAttribute("x1", x(i).toFixed(1));
    cursor.setAttribute("x2", x(i).toFixed(1));
    dot.setAttribute("cx", x(i).toFixed(1));
    dot.setAttribute("cy", y(values[i]).toFixed(1));
    cursor.style.display = "";
    dot.style.display = "";
    readout.textContent = describe(i, false);
  };
  const hidePoint = () => {
    cursor.style.display = "none";
    dot.style.display = "none";
    readout.textContent = describe(n - 1, true);
  };

  svg.addEventListener("pointermove", showPoint);
  svg.addEventListener("pointerdown", showPoint);
  svg.addEventListener("pointerleave", hidePoint);
}

/* ---------- Mastercard reference rate ---------- */

const MC_MESSAGES = {
  blocked: "万事达官网有机器人防护，拒绝了服务器的自动请求",
  http: "万事达接口返回了异常状态",
  unexpected: "万事达返回了无法识别的数据",
  network: "连接万事达接口超时或失败",
};

async function loadMastercard() {
  const dir = state.direction;
  const token = ++state.mcReq;
  el("mc-result").textContent = "查询中…";
  el("mc-detail").textContent = "";

  try {
    const res = await fetch(`/api/mastercard?direction=${dir}`);
    const data = await res.json();
    if (token !== state.mcReq) return;
    state.mc[dir] = data.ok
      ? { rate: data.rate, date: data.fx_date }
      : { error: MC_MESSAGES[data.reason] || "暂时无法读取", status: data.status };
  } catch (err) {
    if (token !== state.mcReq) return;
    state.mc[dir] = { error: "暂时无法读取" };
  }
  renderMastercard();
}

function renderMastercard() {
  const mc = state.mc[state.direction];
  if (!mc) return;

  if (mc.error) {
    el("mc-result").textContent = "暂时无法读取";
    el("mc-detail").textContent = mc.error + (mc.status ? `（HTTP ${mc.status}）` : "") + "。";
    return;
  }

  const [from, to] = currentPair();
  const amount = parseFloat(el("amount").value) || 0;
  const mid = currentMidRate();

  el("mc-result").textContent = `1 ${from} = ${fmt(mc.rate, 6)} ${to}`;

  const parts = [`${fmt(amount, 6)} ${from} ≈ ${fmt(amount * mc.rate, 3)} ${to}`];
  if (mid) {
    const diff = (mc.rate / mid - 1) * 100;
    parts.push(`较中间价 ${diff >= 0 ? "+" : ""}${diff.toFixed(2)}%`);
  }
  if (mc.date) parts.push(`汇率日期 ${mc.date}`);
  el("mc-detail").textContent = parts.join(" · ");
}

/* ---------- init ---------- */

window.addEventListener("DOMContentLoaded", () => {
  initTheme();
  el("swap-btn").addEventListener("click", toggleDirection);
  el("amount").addEventListener("input", runCalculator);
  document.querySelectorAll(".range-tabs .md-tab").forEach((b) => {
    b.addEventListener("click", () => loadHistory(Number(b.dataset.days)));
  });
  el("mc-fetch-btn").addEventListener("click", loadMastercard);
  window.addEventListener("resize", debounce(renderChart, 150));

  loadRate();
  loadHistory(90);
  loadMastercard();
});
