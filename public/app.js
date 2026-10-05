const SOURCES = {
  frankfurter: { label: "欧洲央行参考汇率", via: "Frankfurter", url: "https://frankfurter.dev" },
  "currency-api": { label: "备用源", via: "currency-api", url: "https://github.com/fawazahmed0/exchange-api" },
};

const state = {
  cnyToJpy: null,
  jpyToCny: null,
  rateDate: null,
  rateSource: "frankfurter",
  prevCnyToJpy: null, // previous publication day, for "较前一日"
  prevDate: null,
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
const EASE_STANDARD = "cubic-bezier(0.2, 0, 0, 1)";
const EASE_EMPHASIZED_ACCELERATE = "cubic-bezier(0.3, 0, 0.8, 0.15)";
// M3 Expressive springs converted to curves (m3.material.io, motion specs).
const SPRING_FAST_SPATIAL = { easing: "cubic-bezier(0.42, 1.67, 0.21, 0.90)", duration: 350 };
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

// Odometer: every digit is a column 0–9 that rolls to its value. When only
// some digits change (a new daily fix), just those columns roll, passing
// through the digits in between. When the format changes (direction swap),
// the columns are rebuilt and roll up from 0, left to right.
// The animated columns are hidden from screen readers; a visually hidden copy
// of the text (.sr-only) is what they read.
function odometer(node, text, animate = true) {
  node.dataset.text = text;
  if (!animate || !motionOK()) {
    node.textContent = text;
    return;
  }
  const chars = [...text];
  const isDigit = (c) => c >= "0" && c <= "9";
  let cols = [...node.children].filter((c) => c.classList.contains("odo"));
  const sameShape = cols.length === chars.length &&
    chars.every((c, i) => isDigit(c) === cols[i].classList.contains("odo-digit"));
  if (!sameShape) {
    const strip = [...Array(10).keys()].map((d) => `<span>${d}</span>`).join("");
    node.innerHTML = `<span class="sr-only"></span>` + chars.map((c, i) => isDigit(c)
      ? `<span class="odo odo-digit" style="--i:${i}" aria-hidden="true"><span class="odo-ghost">${c}</span><span class="odo-strip" style="--d:0">${strip}</span></span>`
      : `<span class="odo odo-sym" style="--i:${i}" aria-hidden="true">${esc(c)}</span>`).join("");
    cols = [...node.children].filter((c) => c.classList.contains("odo"));
    void node.offsetWidth; // start every column at 0 before rolling
  }
  node.querySelector(":scope > .sr-only").textContent = text;
  chars.forEach((c, i) => {
    const col = cols[i];
    if (isDigit(c)) {
      col.querySelector(".odo-ghost").textContent = c;
      col.querySelector(".odo-strip").style.setProperty("--d", c);
    } else {
      col.textContent = c;
    }
  });
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

// A short, subtle "pop" (used when a value the user is watching changes).
function pop(node, amount = 1.04) {
  if (!motionOK() || !node.animate) return;
  node.animate([{ transform: "scale(1)" }, { transform: `scale(${amount})` }, { transform: "scale(1)" }], SPRING_FAST_SPATIAL);
}

// Loading indicators leave before the content arrives (shrink + fade), so the
// hand-over reads as one motion instead of a jump.
async function exitLoading(container) {
  const indicator = container.querySelector(".loading-indicator");
  if (!indicator || !motionOK() || !indicator.animate) return;
  const exit = indicator.animate(
    [{ transform: "scale(1)", opacity: 1 }, { transform: "scale(0.2)", opacity: 0 }],
    { duration: 180, easing: EASE_EMPHASIZED_ACCELERATE, fill: "forwards" },
  ).finished.catch(() => {});
  // Animations do not run in background tabs; never let them hold back data.
  await Promise.race([exit, new Promise((resolve) => setTimeout(resolve, 250))]);
}

// mdui snackbar (see "# snackbar 函数" in docs/llms-full.txt).
function notify(message) {
  if (window.mdui && typeof window.mdui.snackbar === "function") window.mdui.snackbar({ message, placement: "bottom" });
}

/* ---------- scroll-triggered entrance ---------- */

// Sections (and the chart drawing) play their entrance when they scroll into
// view, not while still off-screen below the fold.
let chartInView = false;

function initReveal() {
  const sections = document.querySelectorAll(".page > section");
  if (!("IntersectionObserver" in window)) {
    sections.forEach((s) => s.classList.add("in-view"));
    chartInView = true;
    return;
  }
  const reveal = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("in-view");
      reveal.unobserve(entry.target);
    }
  }, { rootMargin: "0px 0px -8% 0px" });
  sections.forEach((s) => reveal.observe(s));

  const chartWatch = new IntersectionObserver((entries) => {
    chartInView = entries.some((e) => e.isIntersecting);
    if (chartInView) chart?.svg.classList.remove("is-waiting");
  }, { threshold: 0.35 });
  chartWatch.observe(el("history-chart"));
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
  if (typeof morphDecoShape === "function" && motionOK()) morphDecoShape();
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

/* ---------- live refresh ---------- */

// While the page stays open, fetch again shortly after the next ECB fix and
// animate whatever changed. Retries every 15 minutes if the fix is late.
let refreshTimer = null;
let refreshDue = 0;
let refreshRetries = 0;

function scheduleRefresh(delayMs) {
  clearTimeout(refreshTimer);
  let delay = delayMs;
  if (delay == null) {
    const next = nextEcbUpdate();
    if (!next) return;
    delay = next.getTime() - Date.now() + 5 * 60000;
  }
  delay = Math.min(Math.max(delay, 30000), 2 ** 31 - 1);
  refreshDue = Date.now() + delay;
  refreshTimer = setTimeout(refreshNow, delay);
}

async function refreshNow() {
  const before = state.rateDate;
  await loadRate({ refresh: true });
  if (state.rateDate && state.rateDate !== before) {
    refreshRetries = 0;
    loadHistory(state.historyDays, { refresh: true });
    scheduleRefresh();
  } else if (refreshRetries++ < 8) {
    scheduleRefresh(15 * 60000);
  } else {
    refreshRetries = 0;
    scheduleRefresh();
  }
}

// Background tabs throttle timers; catch up as soon as the page is visible.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && refreshDue && Date.now() > refreshDue) refreshNow();
});

/* ---------- offline ---------- */

// sw.js marks answers served from its cache with X-From-Cache; together with
// the browser's online/offline events this drives the banner under the bar.
let offlineDataDate = null;

function setOffline(offline) {
  if (offline) {
    el("offline-text").textContent = offlineDataDate
      ? `当前离线，显示的是 ${offlineDataDate} 的汇率`
      : "当前离线，网络恢复后会自动更新";
  }
  el("offline-banner").classList.toggle("is-shown", offline);
}

function noteCached(res, date) {
  if (!res.headers.get("X-From-Cache")) return;
  if (date && (!offlineDataDate || date > offlineDataDate)) offlineDataDate = date;
  setOffline(true);
}

function initOffline() {
  if (!navigator.onLine) setOffline(true);
  window.addEventListener("offline", () => setOffline(true));
  window.addEventListener("online", () => {
    const wasShown = el("offline-banner").classList.contains("is-shown");
    offlineDataDate = null;
    setOffline(false);
    if (wasShown) notify("已恢复联网");
    // Reload whatever failed or came from the cache.
    if (!state.cnyToJpy) loadRate(); else loadRate({ refresh: true });
    loadHistory(state.historyDays, { refresh: Boolean(chart) });
  });
}

/* ---------- copy the converter result ---------- */

function copyFallback(text) {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.cssText = "position:fixed;opacity:0;pointer-events:none";
  document.body.append(area);
  area.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { /* unsupported */ }
  area.remove();
  return ok;
}

let copyResetTimer = 0;

// Copies the plain number (no thousands separators) so it pastes cleanly
// into other calculators and banking apps.
async function copyResult() {
  if (!currentMidRate()) return;
  const text = String(Number(state.calcShown.toFixed(3)));
  let ok = true;
  try { await navigator.clipboard.writeText(text); } catch { ok = copyFallback(text); }
  const [, to] = currentPair();
  notify(ok ? `已复制 ${text} ${to}` : "复制失败，请手动选择数字复制");
  if (!ok) return;
  const btn = el("copy-btn");
  btn.icon = "check";
  pop(btn, 1.15);
  clearTimeout(copyResetTimer);
  copyResetTimer = setTimeout(() => { btn.icon = "content_copy"; }, 1600);
}

/* ---------- share ---------- */

// Shared links look like /?amount=10000&from=JPY and open with that amount
// and direction. The parameters are removed from the address bar once read,
// so it does not keep showing an old amount after the visitor edits it.
function readShareParams() {
  const params = new URLSearchParams(location.search);
  if (!params.has("amount") && !params.has("from")) return;
  const from = (params.get("from") || "").toUpperCase();
  if (from === "CNY" || from === "JPY") state.direction = from === "CNY" ? "cny2jpy" : "jpy2cny";
  const amount = Number(params.get("amount"));
  if (params.has("amount") && Number.isFinite(amount) && amount >= 0 && amount <= 1e12) el("amount").value = String(amount);
  history.replaceState(null, "", location.pathname + location.hash);

  // Put the currencies in the shared order right away (before rates load).
  const [first, second] = currentPair();
  const line = el("rate-line");
  line.append(line.querySelector(".rate-one"), line.querySelector(`[data-cur="${first}"]`),
    line.querySelector(".eq"), el("rate-value"), line.querySelector(`[data-cur="${second}"]`));
  el("amount").label = `金额（${first}）`;
  el("calc-to-label").textContent = second;
}

function shareLink() {
  const [from] = currentPair();
  const url = new URL("/", location.origin);
  url.searchParams.set("amount", String(parseFloat(el("amount").value) || 0));
  url.searchParams.set("from", from);
  return url.href;
}

// System share sheet where available (phones, some desktop browsers);
// otherwise the text and link are copied to the clipboard.
async function shareResult() {
  if (!currentMidRate()) return;
  const [from, to] = currentPair();
  const amount = parseFloat(el("amount").value) || 0;
  const source = state.rateSource === "currency-api" ? "参考汇率" : "欧洲央行参考汇率";
  const text = `${fmt(amount, 3)} ${from} ≈ ${fmt(state.calcShown, 3)} ${to}（${state.rateDate} ${source}）`;
  const url = shareLink();
  if (navigator.share) {
    try {
      await navigator.share({ title: "日元人民币汇率", text, url });
      return;
    } catch (e) {
      if (e.name === "AbortError") return; // the visitor closed the share sheet
    }
  }
  const all = `${text}\n${url}`;
  let ok = true;
  try { await navigator.clipboard.writeText(all); } catch { ok = copyFallback(all); }
  notify(ok ? "已复制分享文字和链接" : "分享失败，请手动复制地址栏中的链接");
}

/* ---------- add to home screen ---------- */

const INSTALL_KEY = "install-dismissed";
let installPrompt = null;

const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function installDismissed() {
  try {
    const at = Number(localStorage.getItem(INSTALL_KEY));
    return at > 0 && Date.now() - at < 30 * 86400000;
  } catch { return false; }
}

// Chromium browsers fire beforeinstallprompt, so the card gets a real
// "安装" button; iOS has no such API, so it explains the Share-sheet steps.
function showInstall(mode) {
  if (isStandalone() || installDismissed()) return;
  if (mode === "ios") {
    el("install-desc").textContent = "点浏览器的「分享」按钮，再选「添加到主屏幕」，就能像 App 一样从桌面打开。";
    el("install-btn").hidden = true;
    el("install-dismiss").textContent = "知道了";
  }
  el("install-section").hidden = false;
}

function hideInstall() {
  el("install-section").hidden = true;
}

function initInstall() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installPrompt = e;
    showInstall("prompt");
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    hideInstall();
    notify("已添加到桌面");
  });
  el("install-btn").addEventListener("click", async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    installPrompt = null;
    if (outcome === "accepted") hideInstall();
  });
  el("install-dismiss").addEventListener("click", () => {
    try { localStorage.setItem(INSTALL_KEY, String(Date.now())); } catch { /* ignore */ }
    hideInstall();
  });
  if (isIOS() && !isStandalone()) showInstall("ios");
}

/* ---------- rate board + calculator ---------- */

async function loadRate({ refresh = false } = {}) {
  const boardNote = el("board-note");
  try {
    const res = await fetch("/api/rate", refresh ? { cache: "no-cache" } : undefined);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    noteCached(res, data.date);
    const changed = data.date !== state.rateDate;
    if (refresh && !changed) return;

    state.cnyToJpy = data.cny_to_jpy;
    state.jpyToCny = data.jpy_to_cny;
    state.rateDate = data.date;
    state.rateSource = data.source;
    state.prevCnyToJpy = data.prev_cny_to_jpy;
    state.prevDate = data.prev_date;

    const updated = el("updated");
    const fallback = data.source === "currency-api";
    updated.innerHTML = fallback
      ? `数据日期 ${esc(data.date)} · 欧洲央行数据暂不可用，当前为备用源 ${sourceLink("currency-api")}`
      : `数据日期 ${esc(data.date)} · ${SOURCES.frankfurter.label}（${sourceLink("frankfurter")}）`;
    fadeIn(updated);

    const next = nextEcbUpdate();
    if (next) boardNote.textContent = `下次更新：${describeLocalTime(next)} 左右（当地时间）`;

    if (!refresh) await exitLoading(el("rate-value"));
    renderRateLine(false);
    renderChange({ flash: refresh });
    runCalculator(refresh ? 600 : 700);
    if (!refresh) scheduleRefresh();
    // The chart may still end a day earlier (it is cached longer); keep the
    // two in step by letting the chart pick up the newer rate.
    if (chart && state.history.length && state.history[state.history.length - 1].date < state.rateDate) {
      renderChart({ morph: true });
    }
  } catch (err) {
    if (refresh) return; // keep showing the last good numbers
    el("updated").textContent = "";
    el("rate-value").textContent = "--";
    el("calc-result").querySelector(".calc-visible").textContent = "--";
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
  odometer(el("rate-value"), fmt(currentMidRate()), true);

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

// "▲ 0.12% 较前一日 (10-01)", in the direction currently shown.
function renderChange({ flash = false } = {}) {
  const box = el("rate-change");
  if (!state.prevCnyToJpy || !state.cnyToJpy) {
    box.textContent = "";
    return;
  }
  const now = state.direction === "cny2jpy" ? state.cnyToJpy : state.jpyToCny;
  const prev = state.direction === "cny2jpy" ? state.prevCnyToJpy : 1 / state.prevCnyToJpy;
  const change = (now - prev) / prev;
  const dir = change > 0 ? "up" : change < 0 ? "down" : "flat";
  const icon = { up: "arrow_upward", down: "arrow_downward", flat: "remove" }[dir];
  const wasEmpty = !box.firstElementChild;
  box.innerHTML =
    `<span class="change-chip is-${dir}"><mdui-icon name="${icon}"></mdui-icon>${pctFmt(change).replace(/^[+−±]/, "")}</span>` +
    `<span class="change-label">较前一日（${esc((state.prevDate || "").slice(5))}）</span>`;
  const chip = box.querySelector(".change-chip");
  if (flash) {
    chip.classList.add("is-flash");
    pop(chip, 1.12);
  } else if (wasEmpty) {
    fadeIn(box, 300);
  }
}

function toggleDirection() {
  state.direction = state.direction === "cny2jpy" ? "jpy2cny" : "cny2jpy";
  el("swap-btn").classList.toggle("is-flipped");
  if (typeof morphDecoShape === "function" && motionOK()) morphDecoShape();
  if (!state.cnyToJpy) return;
  renderRateLine(true);
  renderChange();
  runCalculator(450);
  renderChart({ morph: true });
}

function runCalculator(duration = 220, { fromInput = false } = {}) {
  const amount = parseFloat(el("amount").value) || 0;
  const rate = currentMidRate();
  if (!rate) return;
  const value = amount * rate;
  const node = el("calc-result");
  // The counting animation runs in an aria-hidden span; screen readers get
  // only the final value, not every intermediate frame.
  tweenNumber(node.querySelector(".calc-visible"), state.calcShown, value, (v) => fmt(v, 3), duration);
  node.querySelector(".sr-only").textContent = fmt(value, 3);
  if (fromInput && value !== state.calcShown) pop(node, 1.03);
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

async function loadHistory(days, { refresh = false } = {}) {
  state.historyDays = days;
  const group = el("range-group");
  if (group && String(group.value) !== String(days)) group.value = String(days);

  const token = ++state.historyReq;
  if (!refresh) setChartLoading(true);
  try {
    const res = await fetch(`/api/history?days=${days}`, refresh ? { cache: "no-cache" } : undefined);
    const data = await res.json();
    if (token !== state.historyReq) return;
    if (!data.points || data.points.length < 2) throw new Error(data.error || "no points");
    noteCached(res, data.points[data.points.length - 1].date);
    state.history = data.points;
    state.historySource = data.source || "frankfurter";
    setChartLoading(false);
    if (!chart) await exitLoading(el("history-chart"));
    if (token !== state.historyReq) return;
    renderChart(chart ? { morph: true } : { draw: true });
  } catch (err) {
    if (token !== state.historyReq) return;
    setChartLoading(false);
    if (refresh) return;
    state.history = [];
    chart = null;
    hideTooltip();
    ["readout-latest", "readout-high", "readout-low"].forEach((id) => { el(id).textContent = ""; });
    const wrap = el("history-chart");
    wrap.innerHTML = `<p class="chart-msg">历史走势暂时加载失败，请稍后刷新重试。</p>`;
    fadeIn(wrap);
  }
}

// History points, with today's board rate appended if the (longer cached)
// history has not caught up with it yet, so board and chart always agree.
function chartPoints() {
  const pts = state.history.slice();
  const last = pts[pts.length - 1];
  if (last && state.rateDate && state.cnyToJpy && last.date < state.rateDate) {
    pts.push({ date: state.rateDate, rate: state.cnyToJpy });
  }
  return pts;
}

// Resample a polyline (screen space, x ascending) at `count` evenly spaced x
// positions between x0 and x1, so two lines with different numbers of points
// can be interpolated into each other.
function resample(points, count, x0, x1) {
  const out = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const x = x0 + ((x1 - x0) * k) / (count - 1);
    while (j < points.length - 2 && points[j + 1][0] < x) j++;
    const [ax, ay] = points[j];
    const [bx, by] = points[Math.min(j + 1, points.length - 1)];
    const t = bx === ax ? 0 : Math.min(Math.max((x - ax) / (bx - ax), 0), 1);
    out.push([x, ay + (by - ay) * t]);
  }
  return out;
}

const pathOf = (points) => points.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`).join(" ");

// Chart geometry and the hover handlers live here between renders.
let chart = null;
let morphRaf = 0;

// draw: first appearance (line draws itself); morph: the previous line
// reshapes into the new one (range / direction change, new data).
function renderChart({ draw = false, morph = false } = {}) {
  const pts = chartPoints();
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
  const linePts = values.map((v, i) => [x(i), y(v)]);
  const base = H - padB;

  let axes = "";
  for (let k = 0; k < 4; k++) {
    const v = yMin + ((yMax - yMin) * k) / 3;
    const gy = y(v);
    axes += `<line class="chart-grid" x1="${padL}" x2="${W - padR}" y1="${gy.toFixed(1)}" y2="${gy.toFixed(1)}"/>`;
    axes += `<text class="chart-text" x="${padL - 6}" y="${(gy + 4).toFixed(1)}" text-anchor="end">${axisFmt(v)}</text>`;
  }
  // MM-DD is ambiguous once the range crosses a year ("10-05" twice in 1 年),
  // so longer ranges label the axis with YYYY-MM instead.
  const spanDays = (Date.parse(pts[n - 1].date) - Date.parse(pts[0].date)) / 86400000;
  const tickLabel = (date) => (spanDays > 200 ? date.slice(0, 7) : date.slice(5));
  const ticks = Math.min(5, n);
  for (let k = 0; k < ticks; k++) {
    const i = Math.round((k * (n - 1)) / (ticks - 1));
    const anchor = k === 0 ? "start" : k === ticks - 1 ? "end" : "middle";
    axes += `<text class="chart-text" x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="${anchor}">${esc(tickLabel(pts[i].date))}</text>`;
  }

  const line = pathOf(linePts);
  const areaOf = (p) => `${pathOf(p)} L${p[p.length - 1][0].toFixed(1)} ${base} L${p[0][0].toFixed(1)} ${base} Z`;

  const marker = (i, cls, label, dy) =>
    `<g class="chart-extreme-g ${cls}" style="transform-origin:${x(i).toFixed(1)}px ${y(values[i]).toFixed(1)}px">` +
    `<circle class="chart-extreme" cx="${x(i).toFixed(1)}" cy="${y(values[i]).toFixed(1)}" r="4.5"/>` +
    `<text class="chart-extreme-label" x="${x(i).toFixed(1)}" y="${(y(values[i]) + dy).toFixed(1)}" text-anchor="middle">${label}</text>` +
    `</g>`;
  const [lx, ly] = linePts[n - 1];
  // Latest point: a solid dot with a slowly "breathing" ring around it.
  const latestMark =
    `<g class="chart-latest-g" style="transform-origin:${lx.toFixed(1)}px ${ly.toFixed(1)}px">` +
    `<circle class="chart-pulse" cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="5"/>` +
    `<circle class="chart-latest" cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="4"/>` +
    `</g>`;

  const prev = chart;
  const canMorph = morph && motionOK() && chartInView && prev && prev.W === W && prev.H === H;
  const classes = ["chart-svg"];
  if (draw && motionOK()) classes.push("is-drawing");
  if (draw && motionOK() && !chartInView) classes.push("is-waiting");
  if (canMorph) classes.push("is-morphing");

  cancelAnimationFrame(morphRaf);
  wrap.innerHTML =
    `<svg class="${classes.join(" ")}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" tabindex="0" role="img"` +
    ` aria-label="1 ${from} 兑 ${to} 的历史走势。可用左右方向键查看每一天的汇率。">` +
    `<g class="chart-axes">${axes}</g>` +
    `<path class="chart-area" d="${areaOf(linePts)}"/>` +
    `<path class="chart-line" d="${line}" pathLength="1"/>` +
    marker(maxIdx, "chart-high", "高", -9) +
    marker(minIdx, "chart-low", "低", 17) +
    latestMark +
    `<line class="chart-cursor" x1="0" x2="0" y1="${padT - 6}" y2="${base}"/>` +
    `<circle class="chart-dot" cx="0" cy="0" r="5"/>` +
    `</svg>`;

  const latest = values[n - 1];
  const change = (latest - values[0]) / values[0];
  const fallbackNote = state.historySource === "currency-api" ? ` · 备用源 ${sourceLink("currency-api")}` : "";
  el("readout-latest").innerHTML =
    `最新 ${esc(pts[n - 1].date)} · ${pointFmt(latest)}` +
    ` · <span class="${change >= 0 ? "is-up" : "is-down"}">区间 ${pctFmt(change)}</span>${fallbackNote}`;
  el("readout-high").textContent = `最高 ${pts[maxIdx].date} · ${pointFmt(values[maxIdx])}`;
  el("readout-low").textContent = `最低 ${pts[minIdx].date} · ${pointFmt(values[minIdx])}`;
  if (draw || canMorph) el("chart-readout").querySelectorAll(".chart-readout-line").forEach((node) => fadeIn(node, 300));

  const svg = wrap.querySelector("svg");
  chart = { svg, pts, values, x, y, W, H, n, from, to, step, padL, linePts, active: -1 };
  hideTooltip(true);

  if (canMorph) morphChart(svg, prev, linePts, areaOf, padL, W - padR);

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
    const at = chart.active >= 0 ? chart.active : n - 1;
    showPoint(Math.min(Math.max(at + moves[e.key], 0), n - 1));
  });
}

// Reshape the previous line into the new one on a spring, while the old axis
// labels fade out over the new ones. Markers pop in once the line settles.
function morphChart(svg, prev, linePts, areaOf, x0, x1) {
  const SAMPLES = 120;
  // Start from what is on screen: if the previous morph was interrupted
  // (fast repeated clicks), continue from its in-between shape.
  const a = resample(prev.liveShape || prev.linePts, SAMPLES, x0, x1);
  const b = resample(linePts, SAMPLES, x0, x1);
  const lineEl = svg.querySelector(".chart-line");
  const areaEl = svg.querySelector(".chart-area");
  const finalLine = lineEl.getAttribute("d");
  const finalArea = areaEl.getAttribute("d");

  const oldAxes = prev.svg.querySelector(".chart-axes");
  if (oldAxes) {
    const ghost = oldAxes.cloneNode(true);
    ghost.classList.add("chart-axes-old");
    svg.insertBefore(ghost, svg.firstChild);
    ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: EASE_STANDARD, fill: "forwards" })
      .finished.then(() => ghost.remove()).catch(() => ghost.remove());
  }

  const ease = cubicBezier(0.38, 1.21, 0.22, 1.0); // expressive default spatial
  const duration = 550;
  const start = performance.now();
  const frame = (now) => {
    const t = Math.min((now - start) / duration, 1);
    const e = ease(t);
    const mid = a.map(([px, ay], k) => [px, ay + (b[k][1] - ay) * e]);
    if (chart && chart.svg === svg) chart.liveShape = mid;
    lineEl.setAttribute("d", pathOf(mid));
    areaEl.setAttribute("d", areaOf(mid));
    if (t < 1) {
      morphRaf = requestAnimationFrame(frame);
    } else {
      if (chart && chart.svg === svg) chart.liveShape = null;
      lineEl.setAttribute("d", finalLine);
      areaEl.setAttribute("d", finalArea);
      svg.classList.remove("is-morphing");
      svg.classList.add("is-settled");
    }
  };
  morphRaf = requestAnimationFrame(frame);
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
  initReveal();
  initOffline();
  initInstall();
  readShareParams();
  el("copy-btn").addEventListener("click", copyResult);
  el("share-btn").addEventListener("click", shareResult);
  el("calc-result").addEventListener("click", copyResult);
  el("swap-btn").addEventListener("click", toggleDirection);
  el("amount").addEventListener("input", () => runCalculator(220, { fromInput: true }));
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
