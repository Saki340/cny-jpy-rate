const CURRENCY_API_URL = "https://github.com/fawazahmed0/exchange-api";

const state = {
  cnyToJpy: null,
  jpyToCny: null,
  direction: "jpy2cny",
  historyDays: 90,
  history: [], // [{ date, rate, label? }] always stored as CNY -> JPY
  historyIntraday: false,
  historyReq: 0,
};

const THEME_KEY = "theme-pref";

const el = (id) => document.getElementById(id);

function esc(text) {
  return String(text).replace(/[&<>"']/g, (c) => {
    if (c === "&") return "&" + "amp;";
    if (c === "<") return "&" + "lt;";
    if (c === ">") return "&" + "gt;";
    if (c === '"') return "&" + "quot;";
    return "&#39;";
  });
}

function debounce(fn, ms) {
  let timer = null;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

// In a single-select segmented group, clicking the selected segment deselects
// it (value becomes ""). Put the selection back once the group has rendered;
// setting it synchronously is coalesced away by the component's batched update.
function keepSelection(group, value) {
  group.updateComplete.then(() => { group.value = value; });
}

function fmt(n, maxDigits = 4) {
  if (!isFinite(n)) return "--";
  return n.toLocaleString("zh-CN", { maximumFractionDigits: maxDigits });
}

/* ---------- theme ---------- */

// localStorage can throw (private mode, blocked site data); theme choice is
// only a convenience, so failures are ignored.
function readThemePref() {
  try { return localStorage.getItem(THEME_KEY); } catch { return null; }
}

function saveThemePref(mode) {
  try { localStorage.setItem(THEME_KEY, mode); } catch { /* ignore */ }
}

// Keep the browser UI colour (mobile address bar) in sync with the page surface.
function syncThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  const surface = getComputedStyle(document.documentElement).getPropertyValue("--mdui-color-surface").trim();
  if (meta && surface) meta.content = `rgb(${surface})`;
}

function applyTheme(mode) {
  const next = mode === "dark" || mode === "light" ? mode : "auto";
  saveThemePref(next);
  if (window.mdui && typeof window.mdui.setTheme === "function") {
    window.mdui.setTheme(next);
  } else {
    document.documentElement.classList.remove("mdui-theme-dark", "mdui-theme-light", "mdui-theme-auto");
    document.documentElement.classList.add(`mdui-theme-${next}`);
  }
  syncThemeColor();
  const group = el("theme-group");
  if (group && String(group.value) !== next) group.value = next;
}

function initTheme() {
  const saved = readThemePref();
  applyTheme(saved === "light" || saved === "dark" ? saved : "auto");
  el("theme-group").addEventListener("change", (e) => {
    if (e.target.value) applyTheme(e.target.value);
    else keepSelection(e.target, readThemePref() || "auto");
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", syncThemeColor);
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

    boardNote.textContent = "数据每次访问时实时获取，来源见页面底部。";
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
    `<span>1</span><span class="cur-${from.toLowerCase()}">${from}</span>` +
    `<span class="eq">=</span>` +
    `<span>${fmt(rate)}</span><span class="cur-${to.toLowerCase()}">${to}</span>`;

  const amountField = el("amount");
  if (amountField) amountField.label = `金额（${from}）`;
  el("calc-to-label").textContent = to;
}

function toggleDirection() {
  state.direction = state.direction === "cny2jpy" ? "jpy2cny" : "cny2jpy";
  renderRateLine();
  runCalculator();
  renderChart();
}

function runCalculator() {
  const amount = parseFloat(el("amount").value) || 0;
  const rate = currentMidRate();
  if (!rate) return;
  el("calc-result").textContent = fmt(amount * rate, 3);
}

/* ---------- history chart ---------- */

function axisFmt(v) {
  return v >= 10 ? v.toFixed(2) : v >= 1 ? v.toFixed(3) : v.toFixed(5);
}

function pointFmt(v) {
  return v >= 1 ? v.toFixed(4) : v.toFixed(6);
}

// Intraday points carry full ISO timestamps; show them in the viewer's own
// time zone (visitors are in both China and Japan). Daily points are plain dates.
const timeFmt = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
const dateTimeFmt = new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });

function tickLabel(pt) {
  return pt.date.length > 10 ? timeFmt.format(new Date(pt.date)) : pt.date.slice(5);
}

function pointLabel(pt) {
  return pt.date.length > 10 ? dateTimeFmt.format(new Date(pt.date)) : pt.date;
}

async function loadHistory(days) {
  state.historyDays = days;
  const group = el("range-group");
  if (group && String(group.value) !== String(days)) group.value = String(days);

  const token = ++state.historyReq;
  el("chart-readout").textContent = "加载中…";
  try {
    const res = await fetch(`/api/history?days=${days}`);
    const data = await res.json();
    if (token !== state.historyReq) return;
    if (!data.points || !data.points.length) throw new Error(data.error || "no points");
    state.history = data.points;
    state.historyIntraday = Boolean(data.intraday);
    renderChart();
  } catch (err) {
    if (token !== state.historyReq) return;
    state.history = [];
    el("chart-readout").textContent = "";
    const msg = days === 1
      ? "当天分时暂时无法加载（周末休市或接口受限），请稍后重试。"
      : "历史走势暂时加载失败，请稍后刷新重试。";
    el("history-chart").innerHTML = `<p class="chart-msg">${msg}</p>`;
  }
}

function setReadout(html) {
  el("chart-readout").innerHTML = html;
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
  const padL = 58, padR = 12, padT = 18, padB = 24;
  const n = pts.length;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || max * 0.01 || 1;
  const yMin = min - span * 0.12;
  const yMax = max + span * 0.14;

  let maxIdx = 0, minIdx = 0;
  for (let i = 1; i < n; i++) {
    if (values[i] > values[maxIdx]) maxIdx = i;
    if (values[i] < values[minIdx]) minIdx = i;
  }

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
    labels += `<text class="chart-text" x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="${anchor}">${esc(tickLabel(pts[i]))}</text>`;
  }

  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(n - 1).toFixed(1)} ${H - padB} L${x(0).toFixed(1)} ${H - padB} Z`;

  const highMarker =
    `<circle class="chart-extreme chart-high" cx="${x(maxIdx).toFixed(1)}" cy="${y(values[maxIdx]).toFixed(1)}" r="4.5"/>` +
    `<text class="chart-extreme-label" x="${x(maxIdx).toFixed(1)}" y="${(y(values[maxIdx]) - 8).toFixed(1)}" text-anchor="middle">高</text>`;
  const lowMarker =
    `<circle class="chart-extreme chart-low" cx="${x(minIdx).toFixed(1)}" cy="${y(values[minIdx]).toFixed(1)}" r="4.5"/>` +
    `<text class="chart-extreme-label" x="${x(minIdx).toFixed(1)}" y="${(y(values[minIdx]) + 16).toFixed(1)}" text-anchor="middle">低</text>`;

  wrap.innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="1 ${from} 兑 ${to} 的${state.historyIntraday ? "当天" : "历史"}走势">` +
    grid +
    `<path class="chart-area" d="${area}"/>` +
    `<path class="chart-line" d="${line}"/>` +
    highMarker +
    lowMarker +
    `<line class="chart-cursor" y1="${padT}" y2="${H - padB}" style="display:none"/>` +
    `<circle class="chart-dot" r="3.5" style="display:none"/>` +
    labels +
    `</svg>`;

  const svg = wrap.querySelector("svg");
  const cursor = svg.querySelector(".chart-cursor");
  const dot = svg.querySelector(".chart-dot");

  const describeLine = (i, latest) =>
    `${latest ? (state.historyIntraday ? "当前 " : "最新 ") : ""}${esc(pointLabel(pts[i]))} · 1 ${from} = ${pointFmt(values[i])} ${to}`;

  const defaultHtml =
    `<span class="chart-readout-line">${describeLine(n - 1, true)}</span>` +
    `<span class="chart-readout-line chart-readout-hi">最高 ${esc(pointLabel(pts[maxIdx]))} · ${pointFmt(values[maxIdx])}</span>` +
    `<span class="chart-readout-line chart-readout-lo">最低 ${esc(pointLabel(pts[minIdx]))} · ${pointFmt(values[minIdx])}</span>`;

  setReadout(defaultHtml);

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
    setReadout(`<span class="chart-readout-line">${describeLine(i, false)}</span>`);
  };
  const hidePoint = () => {
    cursor.style.display = "none";
    dot.style.display = "none";
    setReadout(defaultHtml);
  };

  svg.addEventListener("pointermove", showPoint);
  svg.addEventListener("pointerdown", showPoint);
  svg.addEventListener("pointerleave", hidePoint);
}

/* ---------- init ---------- */

window.addEventListener("DOMContentLoaded", () => {
  initTheme();
  el("swap-btn").addEventListener("click", toggleDirection);
  el("amount").addEventListener("input", runCalculator);
  el("range-group").addEventListener("change", (e) => {
    if (e.target.value) loadHistory(Number(e.target.value));
    else keepSelection(e.target, String(state.historyDays));
  });
  window.addEventListener("resize", debounce(renderChart, 150));

  loadRate();
  loadHistory(90);
});
