const SOURCES = {
  frankfurter: { label: "欧洲央行参考汇率", via: "Frankfurter", url: "https://frankfurter.dev" },
  "currency-api": { label: "备用源", via: "currency-api", url: "https://github.com/fawazahmed0/exchange-api" },
};

const state = {
  cnyToJpy: null,
  jpyToCny: null,
  direction: "jpy2cny",
  historyDays: 90,
  history: [], // [{ date, rate }] always stored as CNY -> JPY
  historySource: "frankfurter",
  historyReq: 0,
  calcShown: 0,
};

const THEME_KEY = "theme-pref";

// mdui motion tokens (see "设计令牌" in docs/llms-full.txt), for Web Animations
// called from JS. CSS uses the --mdui-motion-* variables directly.
const EASE_EMPHASIZED_DECELERATE = "cubic-bezier(0.05, 0.7, 0.1, 1)";
const EASE_STANDARD = "cubic-bezier(0.2, 0, 0, 1)";
// M3 Expressive springs converted to curves (m3.material.io, motion specs).
const SPRING_DEFAULT_SPATIAL = { easing: "cubic-bezier(0.38, 1.21, 0.22, 1.00)", duration: 500 };
const SPRING_SLOW_SPATIAL = { easing: "cubic-bezier(0.39, 1.29, 0.35, 0.98)", duration: 650 };

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const motionOK = () => !reducedMotion.matches;

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

function pctFmt(p) {
  const sign = p > 0 ? "+" : p < 0 ? "−" : "±";
  return `${sign}${Math.abs(p * 100).toFixed(2)}%`;
}

function sourceLink(key) {
  const s = SOURCES[key] || SOURCES.frankfurter;
  return `<a href="${s.url}" target="_blank" rel="noopener noreferrer">${esc(s.via)}</a>`;
}

/* ---------- small animation helpers ---------- */

// Replace the text of `node` so that changed characters slide up one by one,
// like an odometer. Unchanged characters stay put.
function rollText(node, text, animate = true) {
  const old = node.dataset.text || "";
  node.dataset.text = text;
  node.setAttribute("aria-label", text);
  if (!animate || !motionOK()) {
    node.textContent = text;
    return;
  }
  // Align from the right so "0.0427" -> "0.0428" only rolls the last digit.
  const shift = text.length - old.length;
  node.innerHTML = [...text]
    .map((ch, i) => {
      const changed = old[i - shift] !== ch;
      return `<span class="digit${changed ? " roll" : ""}" style="--i:${i}" aria-hidden="true">${esc(ch)}</span>`;
    })
    .join("");
}

// Count a number from its previous value to `to` (used by the calculator).
function tweenNumber(node, from, to, format, duration) {
  cancelAnimationFrame(Number(node.dataset.raf || 0));
  if (!motionOK() || !isFinite(from) || from === to) {
    node.textContent = format(to);
    return;
  }
  const start = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const step = (now) => {
    const t = Math.min((now - start) / duration, 1);
    node.textContent = format(from + (to - from) * ease(t));
    if (t < 1) node.dataset.raf = String(requestAnimationFrame(step));
  };
  node.dataset.raf = String(requestAnimationFrame(step));
}

function fadeIn(node, duration = 250) {
  if (!motionOK() || !node.animate) return;
  node.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing: EASE_STANDARD });
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

// The new theme spreads out as a circle from where the user clicked
// (View Transitions API; browsers without it just switch instantly).
let themeOrigin = null;

function switchTheme(mode) {
  if (!document.startViewTransition || !motionOK()) {
    applyTheme(mode);
    return;
  }
  const { x, y } = themeOrigin || { x: window.innerWidth - 80, y: 32 };
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const transition = document.startViewTransition(() => applyTheme(mode));
  transition.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { ...SPRING_SLOW_SPATIAL, pseudoElement: "::view-transition-new(root)" },
    );
  }).catch(() => { /* transition skipped */ });
}

function initTheme() {
  const saved = readThemePref();
  applyTheme(saved === "light" || saved === "dark" ? saved : "auto");
  const group = el("theme-group");
  group.addEventListener("pointerdown", (e) => { themeOrigin = { x: e.clientX, y: e.clientY }; });
  group.addEventListener("change", (e) => {
    if (e.target.value) switchTheme(e.target.value);
    else keepSelection(e.target, readThemePref() || "auto");
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", syncThemeColor);
}

/* ---------- next update time ---------- */

// The ECB publishes reference rates around 16:00 Frankfurt time on working
// days (Mon–Fri; TARGET holidays are ignored here, hence "约"), and Frankfurter
// picks them up shortly after, so we aim for 16:15 Europe/Berlin.
function berlinOffsetMinutes(date) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Berlin", timeZoneName: "shortOffset" })
    .formatToParts(date).find((p) => p.type === "timeZoneName")?.value || "GMT+1";
  const m = name.match(/GMT([+-])(\d+)(?::(\d+))?/);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) : 60;
}

function nextEcbUpdate(now = new Date()) {
  const berlinDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" });
  for (let d = 0; d < 8; d++) {
    const [y, m, day] = berlinDate.format(new Date(now.getTime() + d * 86400000)).split("-").map(Number);
    const weekday = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const wall = new Date(Date.UTC(y, m - 1, day, 16, 15));
    const at = new Date(wall.getTime() - berlinOffsetMinutes(wall) * 60000);
    if (at > now) return at;
  }
  return null;
}

// "今天 22:15" / "明天 22:15" / "周一 22:15", in the viewer's own time zone.
function describeLocalTime(at, now = new Date()) {
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(at) - startOfDay(now)) / 86400000);
  const day = days === 0 ? "今天" : days === 1 ? "明天" : WEEKDAYS[at.getDay()];
  const time = at.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${day} ${time}`;
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
    const fallback = data.source === "currency-api";
    updated.innerHTML = fallback
      ? `数据日期 ${esc(data.date)} · 欧洲央行数据暂不可用，当前为备用源 ${sourceLink("currency-api")}`
      : `数据日期 ${esc(data.date)} · ${SOURCES.frankfurter.label}（${sourceLink("frankfurter")}）`;
    fadeIn(updated);

    const next = nextEcbUpdate();
    if (next) boardNote.textContent = `欧洲央行在工作日公布参考汇率，下次更新约在${describeLocalTime(next)}（你所在地的时间）。`;

    renderRateLine(false);
    runCalculator(700);
  } catch (err) {
    el("updated").textContent = "";
    el("rate-value").textContent = "--";
    el("calc-result").textContent = "--";
    boardNote.textContent = "汇率获取失败，请稍后刷新页面重试。";
  }
}

function currentPair() {
  return state.direction === "cny2jpy" ? ["CNY", "JPY"] : ["JPY", "CNY"];
}

function currentMidRate() {
  return state.direction === "cny2jpy" ? state.cnyToJpy : state.jpyToCny;
}

// The rate line keeps the same DOM nodes and only reorders them, so swapping
// direction can animate the two currency codes trading places (FLIP).
function renderRateLine(swapping) {
  const [from, to] = currentPair();
  const line = el("rate-line");
  const curFrom = line.querySelector(`[data-cur="${from}"]`);
  const curTo = line.querySelector(`[data-cur="${to}"]`);
  const moving = [curFrom, curTo];
  const before = moving.map((n) => n.getBoundingClientRect());

  line.append(line.querySelector(".rate-one"), curFrom, line.querySelector(".eq"), el("rate-value"), curTo);
  rollText(el("rate-value"), fmt(currentMidRate()), true);

  if (swapping && motionOK()) {
    moving.forEach((node, k) => {
      const after = node.getBoundingClientRect();
      const dx = before[k].left - after.left;
      const dy = before[k].top - after.top;
      node.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }],
        SPRING_DEFAULT_SPATIAL,
      );
    });
  }

  const amountField = el("amount");
  if (amountField) amountField.label = `金额（${from}）`;
  el("calc-to-label").textContent = to;
}

function toggleDirection() {
  state.direction = state.direction === "cny2jpy" ? "jpy2cny" : "cny2jpy";
  el("swap-btn").classList.toggle("is-flipped");
  if (typeof morphDecoShape === "function" && motionOK()) morphDecoShape();
  if (!state.cnyToJpy) return;
  renderRateLine(true);
  runCalculator(450);
  renderChart({ animate: true });
}

function runCalculator(duration = 220) {
  const amount = parseFloat(el("amount").value) || 0;
  const rate = currentMidRate();
  if (!rate) return;
  const value = amount * rate;
  tweenNumber(el("calc-result"), state.calcShown, value, (v) => fmt(v, 3), duration);
  state.calcShown = value;
}

/* ---------- history chart ---------- */

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function axisFmt(v) {
  return v >= 10 ? v.toFixed(2) : v >= 1 ? v.toFixed(3) : v.toFixed(5);
}

function pointFmt(v) {
  return v >= 1 ? v.toFixed(4) : v.toFixed(6);
}

function weekday(date) {
  return WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
}

function setChartLoading(loading) {
  el("history-chart").closest(".chart-wrap").classList.toggle("is-loading", loading);
}

async function loadHistory(days) {
  state.historyDays = days;
  const group = el("range-group");
  if (group && String(group.value) !== String(days)) group.value = String(days);

  const token = ++state.historyReq;
  setChartLoading(true);
  try {
    const res = await fetch(`/api/history?days=${days}`);
    const data = await res.json();
    if (token !== state.historyReq) return;
    if (!data.points || data.points.length < 2) throw new Error(data.error || "no points");
    state.history = data.points;
    state.historySource = data.source || "frankfurter";
    setChartLoading(false);
    renderChart({ animate: true });
  } catch (err) {
    if (token !== state.historyReq) return;
    setChartLoading(false);
    state.history = [];
    hideTooltip();
    ["readout-latest", "readout-high", "readout-low"].forEach((id) => { el(id).textContent = ""; });
    const wrap = el("history-chart");
    wrap.innerHTML = `<p class="chart-msg">历史走势暂时加载失败，请稍后刷新重试。</p>`;
    fadeIn(wrap);
  }
}

// Chart geometry and the hover handlers live here between renders.
let chart = null;

function renderChart({ animate = false } = {}) {
  const pts = state.history;
  if (pts.length < 2) return;

  const wrap = el("history-chart");
  wrap.classList.remove("is-loading");
  const [from, to] = currentPair();
  const inverse = state.direction === "jpy2cny";
  const values = pts.map((p) => (inverse ? 1 / p.rate : p.rate));

  // The SVG is drawn 1:1 in CSS pixels so the HTML tooltip can be placed
  // with the same coordinates.
  const W = Math.max(wrap.clientWidth || 600, 260);
  const H = wrap.clientHeight || 220;
  const padL = 58, padR = 12, padT = 20, padB = 24;
  const n = pts.length;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || max * 0.01 || 1;
  const yMin = min - span * 0.12;
  const yMax = max + span * 0.16;

  let maxIdx = 0, minIdx = 0;
  for (let i = 1; i < n; i++) {
    if (values[i] > values[maxIdx]) maxIdx = i;
    if (values[i] < values[minIdx]) minIdx = i;
  }

  const step = (W - padL - padR) / (n - 1);
  const x = (i) => padL + i * step;
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
    const i = Math.round((k * (n - 1)) / (ticks - 1));
    const anchor = k === 0 ? "start" : k === ticks - 1 ? "end" : "middle";
    labels += `<text class="chart-text" x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="${anchor}">${esc(pts[i].date.slice(5))}</text>`;
  }

  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(n - 1).toFixed(1)} ${H - padB} L${x(0).toFixed(1)} ${H - padB} Z`;

  const marker = (i, cls, label, dy) =>
    `<g class="chart-extreme-g ${cls}" style="transform-origin:${x(i).toFixed(1)}px ${y(values[i]).toFixed(1)}px">` +
    `<circle class="chart-extreme" cx="${x(i).toFixed(1)}" cy="${y(values[i]).toFixed(1)}" r="4.5"/>` +
    `<text class="chart-extreme-label" x="${x(i).toFixed(1)}" y="${(y(values[i]) + dy).toFixed(1)}" text-anchor="middle">${label}</text>` +
    `</g>`;

  const anim = animate && motionOK() ? " is-drawing" : "";
  wrap.innerHTML =
    `<svg class="chart-svg${anim}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" tabindex="0" role="img"` +
    ` aria-label="1 ${from} 兑 ${to} 的历史走势。可用左右方向键查看每一天的汇率。">` +
    grid +
    `<path class="chart-area" d="${area}"/>` +
    `<path class="chart-line" d="${line}" pathLength="1"/>` +
    marker(maxIdx, "chart-high", "高", -9) +
    marker(minIdx, "chart-low", "低", 17) +
    `<line class="chart-cursor" x1="0" x2="0" y1="${padT - 6}" y2="${H - padB}"/>` +
    `<circle class="chart-dot" cx="0" cy="0" r="5"/>` +
    labels +
    `</svg>`;

  const latest = values[n - 1];
  const change = (latest - values[0]) / values[0];
  const fallbackNote = state.historySource === "currency-api" ? ` · 备用源 ${sourceLink("currency-api")}` : "";
  el("readout-latest").innerHTML =
    `最新 ${esc(pts[n - 1].date)} · ${pointFmt(latest)}` +
    ` · <span class="${change >= 0 ? "is-up" : "is-down"}">区间 ${pctFmt(change)}</span>${fallbackNote}`;
  el("readout-high").textContent = `最高 ${pts[maxIdx].date} · ${pointFmt(values[maxIdx])}`;
  el("readout-low").textContent = `最低 ${pts[minIdx].date} · ${pointFmt(values[minIdx])}`;
  if (animate) el("chart-readout").querySelectorAll(".chart-readout-line").forEach((node) => fadeIn(node, 300));

  const svg = wrap.querySelector("svg");
  chart = { svg, pts, values, x, y, W, H, n, from, to, step, padL, active: -1 };
  hideTooltip(true);

  const indexAt = (clientX) => {
    const rect = svg.getBoundingClientRect();
    return Math.min(Math.max(Math.round((clientX - rect.left - padL) / step), 0), n - 1);
  };
  svg.addEventListener("pointermove", (e) => showPoint(indexAt(e.clientX)));
  svg.addEventListener("pointerdown", (e) => showPoint(indexAt(e.clientX)));
  // Mouse: hide when leaving. Touch: keep the last point until the user taps elsewhere.
  svg.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hideTooltip(); });
  svg.addEventListener("focus", () => showPoint(chart.active >= 0 ? chart.active : n - 1));
  svg.addEventListener("blur", () => hideTooltip());
  svg.addEventListener("keydown", (e) => {
    const moves = { ArrowLeft: -1, ArrowRight: 1, Home: -n, End: n };
    if (!(e.key in moves)) return;
    e.preventDefault();
    const base = chart.active >= 0 ? chart.active : n - 1;
    showPoint(Math.min(Math.max(base + moves[e.key], 0), n - 1));
  });
}

// Tooltip and cursor follow the pointer; they are moved with CSS transforms
// (and short transitions) so the motion stays smooth while snapping to days.
function showPoint(i) {
  if (!chart) return;
  const { svg, pts, values, x, y, W, n, from, to } = chart;
  const tip = el("chart-tooltip");
  const cursor = svg.querySelector(".chart-cursor");
  const dot = svg.querySelector(".chart-dot");
  const appearing = !tip.classList.contains("is-visible");
  if (i === chart.active && !appearing) return;
  chart.active = i;

  const px = x(i);
  const py = y(values[i]);
  const diff = (values[n - 1] - values[i]) / values[i];

  el("tooltip-date").textContent = `${pts[i].date} ${weekday(pts[i].date)}`;
  el("tooltip-value").textContent = `1 ${from} = ${pointFmt(values[i])} ${to}`;
  el("tooltip-diff").textContent = i === n - 1 ? "最新数据" : `至最新 ${pctFmt(diff)}`;

  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;
  const gap = 14;
  const tx = Math.min(Math.max(px - tw / 2, 0), W - tw);
  const ty = py - th - gap >= 0 ? py - th - gap : py + gap;

  const targets = [tip, cursor, dot];
  if (appearing) targets.forEach((node) => { node.style.transition = "none"; });
  tip.style.setProperty("--tx", `${tx.toFixed(1)}px`);
  tip.style.setProperty("--ty", `${ty.toFixed(1)}px`);
  cursor.style.transform = `translateX(${px.toFixed(1)}px)`;
  dot.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
  if (appearing) {
    void tip.offsetWidth; // apply the start position before re-enabling transitions
    targets.forEach((node) => { node.style.transition = ""; });
  }
  tip.classList.add("is-visible");
  svg.classList.add("is-hovering");
}

function hideTooltip(instant = false) {
  const tip = el("chart-tooltip");
  if (instant) tip.style.transition = "none";
  tip.classList.remove("is-visible");
  if (instant) {
    void tip.offsetWidth;
    tip.style.transition = "";
  }
  if (chart) {
    chart.svg.classList.remove("is-hovering");
    chart.active = -1;
  }
}

/* ---------- init ---------- */

window.addEventListener("DOMContentLoaded", () => {
  initTheme();
  el("swap-btn").addEventListener("click", toggleDirection);
  el("amount").addEventListener("input", () => runCalculator());
  el("range-group").addEventListener("change", (e) => {
    if (e.target.value) loadHistory(Number(e.target.value));
    else keepSelection(e.target, String(state.historyDays));
  });
  // Touch: tapping anywhere outside the chart dismisses the tooltip.
  document.addEventListener("pointerdown", (e) => {
    if (chart && !chart.svg.contains(e.target)) hideTooltip();
  });
  window.addEventListener("resize", debounce(() => renderChart(), 150));

  loadRate();
  loadHistory(90);
});

// Offline support and "add to home screen" (see sw.js).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => { /* optional */ });
  });
}
