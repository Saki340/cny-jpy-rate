// All visible text comes from i18n.js (t(), locale()); see that file.
const SOURCES = {
  frankfurter: { via: "Frankfurter", url: "https://frankfurter.dev" },
  "currency-api": { via: "currency-api", url: "https://github.com/fawazahmed0/exchange-api" },
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
  year: [], // past year of { date, rate }, for renderRank()
};

const DIRECTION_KEY = "direction-pref";

// The last direction used (e.g. always CNY -> JPY) is where the page opens;
// a shared link's ?from= wins over it.
try {
  const savedDirection = localStorage.getItem(DIRECTION_KEY);
  if (savedDirection === "cny2jpy" || savedDirection === "jpy2cny") state.direction = savedDirection;
} catch { /* ignore */ }

// Motion for Web Animations called from JS: the Expressive spring tokens from
// m3/tokens.css (CSS uses the --md-sys-motion-* variables directly).
const EASE_STANDARD = "cubic-bezier(0.2, 0, 0, 1)";
const EASE_EMPHASIZED_ACCELERATE = "cubic-bezier(0.3, 0, 0.8, 0.15)";
function springToken(name) {
  const css = getComputedStyle(document.documentElement);
  return {
    easing: css.getPropertyValue(`--md-sys-motion-spring-${name}`).trim() || EASE_STANDARD,
    duration: parseFloat(css.getPropertyValue(`--md-sys-motion-spring-${name}-duration`)) || 300,
  };
}
const SPRING_FAST_SPATIAL = springToken("fast-spatial");
const SPRING_DEFAULT_SPATIAL = springToken("default-spatial");
const SPRING_SLOW_SPATIAL = springToken("slow-spatial");

// Position of an under-damped spring released from 0 towards 1 (unit mass),
// as a function of progress 0..1 over its settle time (as in tokens.css).
function springCurve(stiffness, damping) {
  const w0 = Math.sqrt(stiffness);
  const wd = w0 * Math.sqrt(1 - damping * damping);
  const settle = Math.log(1000) / (damping * w0);
  return (p) => {
    if (p >= 1) return 1;
    const t = p * settle;
    return 1 - Math.exp(-damping * w0 * t) * (Math.cos(wd * t) + (damping * w0 / wd) * Math.sin(wd * t));
  };
}

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

function fmt(n, maxDigits = 4) {
  if (!isFinite(n)) return "--";
  return n.toLocaleString(locale(), { maximumFractionDigits: maxDigits });
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
  if (!motionOK() || !isFinite(from) || from === to || !(duration > 0)) {
    node.textContent = format(to);
    return;
  }
  const start = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const step = (now) => {
    // A frame's timestamp can be slightly earlier than `start`.
    const t = Math.min(Math.max((now - start) / duration, 0), 1);
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

function notify(message) {
  M3.snackbar(message);
}

// The amount field's floating label ("金额（JPY）").
function setAmountLabel(cur) {
  M3.setLabel(el("amount-field"), t("calc.amount", { cur }));
}

/* ---------- scroll-triggered entrance ---------- */

// Sections (and the chart drawing) play their entrance when they scroll into
// view, not while still off-screen below the fold.
let chartInView = false;

function initReveal() {
  const sections = document.querySelectorAll(".page section");
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

/* ---------- panes (wide screens) ---------- */

// From the expanded width class (840dp) the tools (converter, saved amounts,
// Mastercard, install) move into the supporting pane next to today's rate and
// the chart; below it they go back between them, in reading order. Moving the
// elements (rather than reordering them with CSS) keeps the keyboard and
// screen-reader order the same as what is on screen.
const wideQuery = window.matchMedia("(min-width: 840px)");

function layoutPanes() {
  const main = el("pane-main");
  const side = el("pane-side");
  if (!main || !side) return;
  const focused = document.activeElement;
  const tools = [...document.querySelectorAll(".sec-side")];
  if (wideQuery.matches) {
    side.append(...tools);
  } else {
    // calc and saved between the rate and the chart; the rest after the chart
    main.querySelector(".sec-rate").after(...tools.filter((s) => s.matches(".sec-calc, .sec-saved")));
    main.querySelector(".sec-chart").after(...tools.filter((s) => !s.matches(".sec-calc, .sec-saved")));
  }
  if (focused && focused !== document.activeElement && document.contains(focused)) focused.focus({ preventScroll: true });
}

layoutPanes(); // before the first paint (this script runs at the end of <body>)
wideQuery.addEventListener("change", () => {
  layoutPanes();
  if (chart) renderChart();
});

/* ---------- theme ---------- */

// Every visit starts in the system theme (theme-auto) and follows it; the
// light / dark switch overrides it for this visit only and is not saved.
const darkScheme = window.matchMedia("(prefers-color-scheme: dark)");

// Keep the browser UI colour (mobile address bar) in sync with the page surface.
// Keep the browser UI colour (mobile address bar) in step with the top app
// bar: surface, or surface-container once content scrolls under it. Both
// theme-color metas (light / dark, for the first paint) get the same value.
let barScrolled = null;
function syncThemeColor() {
  barScrolled = el("app-bar").classList.contains("is-scrolled");
  const token = barScrolled ? "--md-sys-color-surface-container" : "--md-sys-color-surface";
  const color = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  if (color) document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => { meta.content = color; });
}
window.addEventListener("scroll", () => {
  if (el("app-bar").classList.contains("is-scrolled") !== barScrolled) syncThemeColor();
}, { passive: true });

function applyTheme(mode) {
  document.documentElement.classList.remove("theme-dark", "theme-light", "theme-auto");
  document.documentElement.classList.add(`theme-${mode}`);
  syncThemeColor();
}

// While following the system, the switch shows the system's current theme.
function showSystemTheme() {
  if (document.documentElement.classList.contains("theme-auto")) el("theme-group").value = darkScheme.matches ? "dark" : "light";
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
  const group = M3.buttonGroup(el("theme-group"));
  try { localStorage.removeItem("theme-pref"); } catch { /* ignore */ } // the old saved choice
  applyTheme("auto");
  showSystemTheme();
  group.addEventListener("pointerdown", (e) => { themeOrigin = { x: e.clientX, y: e.clientY }; });
  group.addEventListener("change", () => switchTheme(group.value));
  darkScheme.addEventListener("change", () => {
    showSystemTheme();
    syncThemeColor();
  });
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

// "下次更新：今天 22:15 左右" etc., in the viewer's own time zone and language.
function describeNextUpdate(at, now = new Date()) {
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(at) - startOfDay(now)) / 86400000);
  const day = days === 0 ? t("day.today") : days === 1 ? t("day.tomorrow") : t("day.weekday")[at.getDay()];
  const time = at.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit", hour12: false });
  return t("board.next", { day, time });
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
    loadYear();
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
      ? t("offline.date", { date: offlineDataDate })
      : t("offline.plain");
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
    if (wasShown) notify(t("notify.online"));
    // Reload whatever failed or came from the cache.
    if (!state.cnyToJpy) loadRate(); else loadRate({ refresh: true });
    loadHistory(state.historyDays, { refresh: Boolean(chart) });
    if (!state.year.length) loadYear();
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
  notify(ok ? t("notify.copied", { value: text, cur: to }) : t("notify.copyFail"));
  if (!ok) return;
  const btn = el("copy-btn");
  const icon = btn.querySelector(".m3-icon");
  icon.dataset.icon = "check";
  pop(btn, 1.15);
  clearTimeout(copyResetTimer);
  copyResetTimer = setTimeout(() => { icon.dataset.icon = "content_copy"; }, 1600);
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
  if (params.has("amount") && Number.isFinite(amount) && amount >= 0 && amount <= 1e12) {
    el("amount").value = String(amount);
    readAmount();
  }
  const clean = new URL(location.href);
  clean.searchParams.delete("amount");
  clean.searchParams.delete("from");
  history.replaceState(null, "", clean.pathname + clean.search + clean.hash); // keeps ?lang=
}

// Puts the currencies in the current order right away (before rates load):
// the remembered direction, or the one from a shared link.
function placeCurrencies() {
  const [first, second] = currentPair();
  const line = el("rate-line");
  line.append(line.querySelector(".rate-one"), line.querySelector(`[data-cur="${first}"]`),
    line.querySelector(".eq"), el("rate-value"), line.querySelector(`[data-cur="${second}"]`));
  setAmountLabel(first);
  el("calc-result-label").textContent = t("calc.result", { cur: second });
}

function shareLink() {
  const [from] = currentPair();
  const url = new URL("/", location.origin);
  url.searchParams.set("amount", String(Number(lastAmount.toFixed(2))));
  url.searchParams.set("from", from);
  // Same language as the shared text, so the link preview matches it too.
  if (currentLang !== "zh") url.searchParams.set("lang", currentLang);
  return url.href;
}

// System share sheet where available (phones, some desktop browsers);
// otherwise the text and link are copied to the clipboard.
async function shareResult() {
  if (!currentMidRate()) return;
  const [from, to] = currentPair();
  const amount = lastAmount;
  const source = t(state.rateSource === "currency-api" ? "share.sourceFallback" : "share.source");
  const text = t("share.text", { a: fmt(amount, 3), from, b: fmt(state.calcShown, 3), to, date: state.rateDate, source });
  const url = shareLink();
  if (navigator.share) {
    try {
      await navigator.share({ title: t("share.title"), text, url });
      return;
    } catch (e) {
      if (e.name === "AbortError") return; // the visitor closed the share sheet
    }
  }
  const all = `${text}\n${url}`;
  let ok = true;
  try { await navigator.clipboard.writeText(all); } catch { ok = copyFallback(all); }
  notify(ok ? t("notify.shareCopied") : t("notify.shareFail"));
}

/* ---------- add to home screen ---------- */

const INSTALL_KEY = "install-dismissed";
let installPrompt = null;

const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
// Android browsers other than Chrome. Chrome lists "Google Chrome" in its
// brands; Samsung Internet, Edge, Opera etc. list their own, and Firefox has no
// userAgentData at all, so all of those count as "other".
const isAndroidNotChrome = () => /Android/i.test(navigator.userAgent) &&
  !(navigator.userAgentData?.brands || []).some((b) => b.brand === "Google Chrome");

// Android intent link that opens the current page (with its ?lang=) in
// Chrome; without Chrome the browser falls back to the same page.
function chromeIntentUrl() {
  const url = new URL(location.href);
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;package=com.android.chrome;` +
    `S.browser_fallback_url=${encodeURIComponent(url.href)};end`;
}

function installDismissed() {
  try {
    const at = Number(localStorage.getItem(INSTALL_KEY));
    return at > 0 && Date.now() - at < 30 * 86400000;
  } catch { return false; }
}

// Chromium browsers fire beforeinstallprompt, so the card gets a real
// "安装" button; iOS has no such API, so it explains the Share-sheet steps.
// Other Android browsers (Samsung Internet and others): installing may trigger
// a Play Protect "older version of Android" warning, so the card recommends
// Chrome (the browser's own install button is kept if it offers a prompt).
function showInstall(mode) {
  if (isStandalone() || installDismissed()) return;
  if (mode === "ios") {
    el("install-desc").dataset.i18n = "install.ios";
    el("install-dismiss").dataset.i18n = "install.ok";
    el("install-btn").hidden = true;
    applyI18n(el("install-section"));
  }
  if (isAndroidNotChrome()) {
    el("install-browser-note").hidden = false;
    el("install-chrome").href = chromeIntentUrl();
    el("install-chrome").hidden = false;
    el("install-btn").hidden = !installPrompt;
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
    notify(t("notify.installed"));
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
  else if (isAndroidNotChrome()) showInstall("other-browser");
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

    renderBoardText();
    fadeIn(el("updated"));

    if (!refresh) await exitLoading(el("rate-value"));
    renderRateLine(false);
    renderChange({ flash: refresh });
    runCalculator(refresh ? 600 : 700);
    renderRank();
    renderSaved();
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
    boardNote.dataset.i18n = "rate.error";
    boardNote.textContent = t("rate.error");
  }
}

// Data line ("数据日期 …") and the next-update note; re-run on language change.
function renderBoardText() {
  if (!state.rateDate) return;
  const fallback = state.rateSource === "currency-api";
  el("updated").innerHTML = t(fallback ? "updated.fallback" : "updated", {
    date: esc(state.rateDate),
    link: sourceLink(fallback ? "currency-api" : "frankfurter"),
  });
  const next = nextEcbUpdate();
  const note = el("board-note");
  if (next) {
    delete note.dataset.i18n;
    note.textContent = describeNextUpdate(next);
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

  setAmountLabel(from);
  el("calc-result-label").textContent = t("calc.result", { cur: to });
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
    `<span class="change-chip is-${dir}"><span class="m3-icon" data-icon="${icon}" aria-hidden="true"></span>${pctFmt(change).replace(/^[+−±]/, "")}</span>` +
    `<span class="change-label">${esc(t("change.label", { date: (state.prevDate || "").slice(5) }))}</span>`;
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
  try { localStorage.setItem(DIRECTION_KEY, state.direction); } catch { /* ignore */ }
  el("swap-btn").classList.toggle("is-flipped");
  if (typeof morphDecoShape === "function" && motionOK()) morphDecoShape();
  if (!state.cnyToJpy) return;
  renderRateLine(true);
  renderChange();
  renderRank();
  runCalculator(450);
  renderChart({ morph: true });
}

function runCalculator(duration = 220, { fromInput = false } = {}) {
  const amount = readAmount();
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
  renderDate(); // "rate on a date" converts the same amount
}

/* ---------- history chart ---------- */

function axisFmt(v) {
  return v >= 10 ? v.toFixed(2) : v >= 1 ? v.toFixed(3) : v.toFixed(5);
}

function pointFmt(v) {
  return v >= 1 ? v.toFixed(4) : v.toFixed(6);
}

function weekday(date) {
  return t("weekday.short")[new Date(`${date}T00:00:00Z`).getUTCDay()];
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
    wrap.innerHTML = `<p class="chart-msg" data-i18n="chart.error">${esc(t("chart.error"))}</p>`;
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

// 30-day moving average (calendar days) for each day shown, in the direction
// shown; uses the year of data when loaded, so short ranges get a full window.
// null where fewer than 30 days of data lie behind a day. Statistics only.
function movingAverage(pts, inverse, days = 30) {
  const byDate = new Map();
  for (const p of [...state.year, ...state.history, ...pts]) byDate.set(p.date, p.rate);
  const src = [...byDate].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, rate]) => ({ t: Date.parse(date), v: inverse ? 1 / rate : rate }));
  const span = days * 86400000;
  const out = [];
  let lo = 0, hi = 0, sum = 0;
  for (const p of pts) {
    const time = Date.parse(p.date);
    while (hi < src.length && src[hi].t <= time) sum += src[hi++].v;
    while (lo < hi && src[lo].t <= time - span) sum -= src[lo++].v;
    out.push(src.length && time - span >= src[0].t && hi > lo ? sum / (hi - lo) : null);
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
  const ma = movingAverage(pts, inverse);
  const maValues = ma.filter((v) => v !== null);

  // The SVG is drawn 1:1 in CSS pixels so the HTML tooltip can be placed
  // with the same coordinates.
  const W = Math.max(wrap.clientWidth || 600, 260);
  const H = wrap.clientHeight || 220;
  const padL = 58, padR = 12, padT = 20, padB = 24;
  const n = pts.length;

  const min = Math.min(...values, ...maValues);
  const max = Math.max(...values, ...maValues);
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
  const ticks = Math.min(W >= 640 ? 7 : 5, n); // more dates on a wide chart
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
    ` aria-label="${esc(t("chart.aria", { from, to }))}">` +
    `<g class="chart-axes">${axes}</g>` +
    `<path class="chart-area" d="${areaOf(linePts)}"/>` +
    `<path class="chart-line" d="${line}" pathLength="1"/>` +
    (maValues.length > 1 ? `<path class="chart-ma" d="${pathOf(ma.map((v, i) => (v === null ? null : [x(i), y(v)])).filter(Boolean))}"/>` : "") +
    marker(maxIdx, "chart-high", esc(t("chart.high")), -9) +
    marker(minIdx, "chart-low", esc(t("chart.low")), 17) +
    latestMark +
    `<line class="chart-cursor" x1="0" x2="0" y1="${padT - 6}" y2="${base}"/>` +
    `<circle class="chart-dot" cx="0" cy="0" r="5"/>` +
    `</svg>`;

  const latest = values[n - 1];
  const change = (latest - values[0]) / values[0];
  const fallbackNote = state.historySource === "currency-api" ? ` · ${esc(t("readout.fallback"))} ${sourceLink("currency-api")}` : "";
  el("readout-latest").innerHTML =
    `${esc(t("readout.latest"))} ${esc(pts[n - 1].date)} · ${pointFmt(latest)}` +
    ` · <span class="${change >= 0 ? "is-up" : "is-down"}">${esc(t("readout.range"))} ${pctFmt(change)}</span>${fallbackNote}`;
  el("readout-high").textContent = `${t("readout.high")} ${pts[maxIdx].date} · ${pointFmt(values[maxIdx])}`;
  el("readout-low").textContent = `${t("readout.low")} ${pts[minIdx].date} · ${pointFmt(values[minIdx])}`;
  el("readout-ma").textContent = ma[n - 1] === null ? "" : t("readout.ma", { v: pointFmt(ma[n - 1]) });
  if (draw || canMorph) el("chart-readout").querySelectorAll(".chart-readout-line").forEach((node) => fadeIn(node, 300));

  const svg = wrap.querySelector("svg");
  chart = { svg, pts, values, ma, x, y, W, H, n, from, to, step, padL, linePts, active: -1 };
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

  // Expressive default spatial spring (stiffness 380, damping ratio 0.8).
  const ease = springCurve(380, 0.8);
  const duration = SPRING_DEFAULT_SPATIAL.duration;
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
  el("tooltip-diff").textContent = i === n - 1 ? t("tooltip.latest") : t("tooltip.toLatest", { pct: pctFmt(diff) });
  el("tooltip-ma").textContent = chart.ma[i] === null ? "" : t("tooltip.ma", { v: pointFmt(chart.ma[i]) });

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

/* ---------- amount field: simple expressions ---------- */

// The amount field accepts simple arithmetic ("1980*3", "85000+12000",
// "(1200+800)/2"), including full-width characters typed with Chinese or
// Japanese input methods. Returns the value, or null if it cannot be worked
// out (or is negative / too large).
function evaluateAmount(text) {
  const src = String(text)
    .replace(/[（）＊＋－．／０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[×xX]/g, "*")
    .replace(/÷/g, "/")
    .replace(/[−–]/g, "-")
    .replace(/[,，\s]/g, "");
  if (!src) return 0;
  const tokens = src.match(/\d+(?:\.\d*)?|\.\d+|[-+*/()]/g);
  if (!tokens || tokens.join("") !== src) return null;
  let pos = 0;
  const peek = () => tokens[pos];
  // expr = term (("+" | "-") term)*; term = factor (("*" | "/") factor)*;
  // factor = ("+" | "-") factor | number | "(" expr ")"
  const expr = () => {
    let v = term();
    while (peek() === "+" || peek() === "-") v = tokens[pos++] === "+" ? v + term() : v - term();
    return v;
  };
  const term = () => {
    let v = factor();
    while (peek() === "*" || peek() === "/") v = tokens[pos++] === "*" ? v * factor() : v / factor();
    return v;
  };
  const factor = () => {
    const tok = tokens[pos++];
    if (tok === "+") return factor();
    if (tok === "-") return -factor();
    if (tok === "(") {
      const v = expr();
      if (tokens[pos++] !== ")") throw new Error("unclosed");
      return v;
    }
    if (tok !== undefined && /^[\d.]/.test(tok)) return Number(tok);
    throw new Error("unexpected");
  };
  try {
    const v = expr();
    if (pos !== tokens.length || !Number.isFinite(v) || v < 0 || v > 1e12) return null;
    return v;
  } catch {
    return null;
  }
}

// True if the text is more than a plain number (worth showing "= result").
const isExpression = (text) => /\d.*[-+*/×÷xX−＋－＊／()（）]|[()（）]/.test(String(text).trim().replace(/^[-+]/, ""));

// The amount used for converting: the field's value; while an expression is
// unfinished ("1980*"), the last value that could be worked out.
let lastAmount = 100;

// Reads the field and updates its supporting text: "= 5,940" under an
// expression; an error only when `strict` (on Enter / leaving the field),
// so it does not flash while the visitor is still typing.
function readAmount({ strict = false } = {}) {
  const text = el("amount").value;
  const value = evaluateAmount(text);
  const field = el("amount-field");
  const support = el("amount-support");
  const error = value === null && strict;
  field.classList.toggle("is-error", error);
  if (error) support.textContent = t("amount.invalid");
  else if (value !== null && isExpression(text)) support.textContent = t("amount.preview", { v: fmt(value, 3) });
  else support.textContent = "";
  if (value !== null) lastAmount = value;
  return lastAmount;
}

// Enter: an expression is replaced by its result.
function settleAmount() {
  const input = el("amount");
  const value = evaluateAmount(input.value);
  if (value !== null && isExpression(input.value)) {
    input.value = String(Number(value.toFixed(6)));
    runCalculator(220, { fromInput: true });
  }
  readAmount({ strict: true });
}

// Inserts an operator from the on-screen keys at the caret.
function insertIntoAmount(text) {
  const input = el("amount");
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  input.setRangeText(text, start, end, "end");
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function initAmountField() {
  const input = el("amount");
  input.addEventListener("input", () => runCalculator(220, { fromInput: true }));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); settleAmount(); }
  });
  input.addEventListener("change", () => readAmount({ strict: true }));
  for (const key of document.querySelectorAll(".calc-keys [data-insert]")) {
    // Keep the focus (and the phone keyboard) in the field.
    key.addEventListener("pointerdown", (e) => e.preventDefault());
    key.addEventListener("click", () => insertIntoAmount(key.dataset.insert));
  }
  readAmount();
}

/* ---------- where today's rate stands in the past year ---------- */

// "JPY → CNY：处于近一年较高水平 · 高于近一年 77% 的日子": today's rate ranked
// among the past year's daily rates, in the direction shown. Statistics only,
// worded neutrally (no "good / bad time to convert" judgement).
async function loadYear() {
  try {
    const res = await fetch("/api/history?days=365");
    const data = await res.json();
    if (Array.isArray(data.points) && data.points.length >= 20) {
      state.year = data.points;
      renderRank();
      if (chart) renderChart(); // the 30-day average needs the days before the range
    }
  } catch { /* the indicator just stays hidden */ }
}

function renderRank() {
  const box = el("rate-rank");
  if (!state.year.length || !state.cnyToJpy) return;
  const pts = state.year.slice();
  if (state.rateDate && pts[pts.length - 1].date < state.rateDate) pts.push({ date: state.rateDate, rate: state.cnyToJpy });
  const inverse = state.direction === "jpy2cny";
  const values = pts.map((p) => (inverse ? 1 / p.rate : p.rate));
  const now = currentMidRate();
  const pct = Math.round((values.filter((v) => v < now).length / values.length) * 100);
  const level = pct >= 67 ? "levelHigh" : pct >= 34 ? "levelMid" : "levelLow";
  const [from, to] = currentPair();
  el("rank-verdict").textContent = t("rank.verdict", { from, to, level: t(`rank.${level}`) });
  el("rank-pct").textContent = t("rank.pct", { p: pct });
  el("rank-low").textContent = t("rank.low", { v: pointFmt(Math.min(...values)) });
  el("rank-high").textContent = t("rank.high", { v: pointFmt(Math.max(...values)) });
  const meter = el("rank-meter");
  meter.setAttribute("aria-valuenow", String(pct));
  meter.setAttribute("aria-valuetext", `${el("rank-verdict").textContent}, ${el("rank-pct").textContent}`);
  if (box.hidden) {
    box.hidden = false;
    fadeIn(box, 300);
    // Grow from 0 on first appearance.
    requestAnimationFrame(() => requestAnimationFrame(() => box.style.setProperty("--rank-p", pct / 100)));
  } else {
    box.style.setProperty("--rank-p", pct / 100);
  }
}

/* ---------- saved amounts ---------- */

// Amounts the visitor converts often (rent, tuition, …), kept in this
// browser only and shown converted at the latest rate on every visit.
// Tapping one puts it into the converter.
const SAVED_KEY = "saved-amounts";
const SAVED_MAX = 10;
let saved = readSaved();
let savedDialog = null;
let editingId = null;

function readSaved() {
  try {
    const list = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]");
    if (!Array.isArray(list)) return [];
    return list
      .filter((i) => i && typeof i.id === "string" && Number.isFinite(i.amount) && i.amount > 0 && (i.cur === "JPY" || i.cur === "CNY"))
      .map((i) => ({ id: i.id, name: String(i.name || "").slice(0, 20), amount: i.amount, cur: i.cur }))
      .slice(0, SAVED_MAX);
  } catch {
    return [];
  }
}

function writeSaved() {
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(saved)); } catch { /* ignore */ }
}

function convertAmount(amount, from) {
  if (!state.cnyToJpy) return null;
  return amount * (from === "CNY" ? state.cnyToJpy : state.jpyToCny);
}

function renderSaved() {
  const list = el("saved-list");
  el("saved-empty").hidden = saved.length > 0;
  list.hidden = saved.length === 0;
  list.innerHTML = saved.map((item) => {
    const to = item.cur === "CNY" ? "JPY" : "CNY";
    const value = convertAmount(item.amount, item.cur);
    const amountText = `${fmt(item.amount, 2)} ${item.cur}`;
    const name = item.name || amountText;
    const editLabel = esc(t("saved.edit", { name }));
    return `<li class="m3-list-item saved-item">` +
      `<button type="button" class="m3-list-item__main m3-interactive" data-use="${esc(item.id)}">` +
      `<span class="m3-list-item__text"><span class="m3-list-item__headline">${esc(name)}</span>` +
      (item.name ? `<span class="m3-list-item__supporting">${esc(amountText)}</span>` : "") + `</span>` +
      `<span class="saved-result"><span class="sr-only">≈</span><span class="saved-result-value">${value === null ? "--" : esc(fmt(value, 2))}</span> <span class="saved-result-cur">${to}</span></span>` +
      `</button>` +
      `<button type="button" class="m3-icon-button m3-interactive" data-edit="${esc(item.id)}" aria-label="${editLabel}" data-tooltip="${editLabel}"><span class="m3-icon" data-icon="edit" aria-hidden="true"></span></button>` +
      `</li>`;
  }).join("");
}

function useSaved(item) {
  if (currentPair()[0] !== item.cur) toggleDirection();
  el("amount").value = String(item.amount);
  runCalculator(450, { fromInput: true });
  el("calc-heading").scrollIntoView({ behavior: motionOK() ? "smooth" : "auto", block: "start" });
}

function setSavedError(message) {
  el("saved-amount-field").classList.toggle("is-error", Boolean(message));
  el("saved-amount-support").textContent = message || "";
}

function openSavedDialog(item = null) {
  editingId = item ? item.id : null;
  el("saved-dialog-title").textContent = t(item ? "saved.dialogEdit" : "saved.dialogAdd");
  el("saved-name").value = item ? item.name : "";
  el("saved-amount").value = item ? String(item.amount) : (lastAmount > 0 ? String(Number(lastAmount.toFixed(2))) : "");
  el("saved-cur").value = item ? item.cur : currentPair()[0];
  el("saved-delete").hidden = !item;
  setSavedError("");
  savedDialog.open();
  el("saved-name").focus();
}

function submitSaved() {
  const amount = evaluateAmount(el("saved-amount").value);
  if (!amount) {
    setSavedError(t("saved.invalid"));
    el("saved-amount").focus();
    return;
  }
  const entry = {
    id: editingId || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: el("saved-name").value.trim().slice(0, 20),
    amount: Number(amount.toFixed(6)),
    cur: el("saved-cur").value,
  };
  const at = saved.findIndex((i) => i.id === editingId);
  if (at >= 0) {
    saved[at] = entry;
  } else if (saved.length >= SAVED_MAX) {
    notify(t("saved.full", { n: SAVED_MAX }));
    return;
  } else {
    saved.push(entry);
  }
  writeSaved();
  renderSaved();
  savedDialog.close("save");
  notify(t("saved.done"));
}

function deleteSaved() {
  const at = saved.findIndex((i) => i.id === editingId);
  if (at < 0) return;
  const [removed] = saved.splice(at, 1);
  writeSaved();
  renderSaved();
  savedDialog.close("delete");
  M3.snackbar(t("saved.deleted", { name: removed.name || `${fmt(removed.amount, 2)} ${removed.cur}` }), {
    action: t("saved.undo"),
    onAction: () => {
      saved.splice(Math.min(at, saved.length), 0, removed);
      writeSaved();
      renderSaved();
    },
  });
}

function initSaved() {
  savedDialog = M3.dialog(el("saved-dialog"));
  M3.buttonGroup(el("saved-cur"));
  el("saved-add").addEventListener("click", () => openSavedDialog());
  el("saved-list").addEventListener("click", (e) => {
    const use = e.target.closest("[data-use]");
    const edit = e.target.closest("[data-edit]");
    const item = saved.find((i) => i.id === (use || edit)?.dataset[use ? "use" : "edit"]);
    if (!item) return;
    if (use) useSaved(item);
    else openSavedDialog(item);
  });
  el("saved-form").addEventListener("submit", (e) => { e.preventDefault(); submitSaved(); });
  el("saved-cancel").addEventListener("click", () => savedDialog.close());
  el("saved-delete").addEventListener("click", deleteSaved);
  el("saved-amount").addEventListener("input", () => setSavedError(""));
  // Another tab changed the list.
  window.addEventListener("storage", (e) => {
    if (e.key === SAVED_KEY) { saved = readSaved(); renderSaved(); }
  });
  renderSaved();
}

/* ---------- rate on a date ---------- */

// Any day since 2005 (/api/day): that day's rate in the current direction and
// the converter's amount converted at it. A weekend or holiday gets the
// previous working day, and the note says so.
const dayCache = new Map();
let dayReq = 0;
let dayData = null;

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function setDateMessage(text) {
  el("date-result").innerHTML = `<p class="meta-text">${esc(text)}</p>`;
}

async function lookupDate() {
  const value = el("date-input").value;
  const token = ++dayReq;
  if (!value) {
    dayData = null;
    renderDate();
    return;
  }
  if (!dayCache.has(value)) {
    setDateMessage(t("date.loading"));
    try {
      const res = await fetch(`/api/day?date=${encodeURIComponent(value)}`);
      const data = await res.json();
      if (!res.ok || data.error || !(data.cny_to_jpy > 0)) throw new Error(data.error || "failed");
      dayCache.set(value, data);
    } catch {
      if (token === dayReq) setDateMessage(t("date.error"));
      return;
    }
  }
  if (token !== dayReq) return;
  dayData = dayCache.get(value);
  renderDate();
  fadeIn(el("date-result"), 250);
}

function renderDate() {
  const box = el("date-result");
  if (!box) return;
  if (!dayData) {
    box.innerHTML = `<p class="meta-text">${esc(t("date.hint"))}</p>`;
    return;
  }
  const [from, to] = currentPair();
  const rate = state.direction === "cny2jpy" ? dayData.cny_to_jpy : 1 / dayData.cny_to_jpy;
  const day = { date: dayData.date, weekday: weekday(dayData.date) };
  let note = dayData.date !== dayData.requested
    ? t("date.fallback", { asked: dayData.requested, ...day })
    : t("date.on", day);
  if (dayData.source === "currency-api") note += ` · ${t("readout.fallback")} currency-api`;
  box.innerHTML =
    `<p class="date-rate">1 ${from} = ${esc(pointFmt(rate))} ${to}</p>` +
    `<p class="date-amount">${esc(t("calc.pair", { a: fmt(lastAmount, 3), from, b: fmt(lastAmount * rate, 3), to }))}</p>` +
    `<p class="meta-text">${esc(note)}</p>`;
}

function initDateLookup() {
  const input = el("date-input");
  input.max = localToday();
  input.addEventListener("change", lookupDate);
}

/* ---------- keyboard shortcuts ---------- */

// For wide screens with a keyboard: / amount, S swap, 1–4 chart range,
// D date lookup, ? the list. Ignored while typing, with modifier keys, or
// while a dialog or the menu is open.
let shortcutsDialog = null;

function initShortcuts() {
  const help = M3.dialog(el("shortcuts-dialog"));
  shortcutsDialog = help;
  el("shortcuts-close").addEventListener("click", () => help.close());
  const ranges = { 1: "30", 2: "90", 3: "180", 4: "365" };
  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;
    if (document.querySelector("dialog[open]") || el("lang-menu").open || el("more-menu").open) return;
    if (e.key === "/") {
      e.preventDefault();
      el("amount").focus();
      el("amount").select();
    } else if (e.key === "s" || e.key === "S") {
      toggleDirection();
    } else if (e.key in ranges) {
      const group = el("range-group");
      if (group.value !== ranges[e.key]) {
        group.value = ranges[e.key];
        loadHistory(Number(ranges[e.key]));
      }
    } else if (e.key === "d" || e.key === "D") {
      e.preventDefault();
      el("date-input").focus();
    } else if (e.key === "?") {
      e.preventDefault();
      help.open();
    }
  });
}

/* ---------- pull to refresh ---------- */

// Phones: pull down at the top of the page to fetch the rate and the charts
// again. Rates change once per working day, so "already up to date" is the
// usual answer.
async function pullRefresh() {
  const before = state.rateDate;
  await Promise.all([
    loadRate(state.cnyToJpy ? { refresh: true } : undefined),
    loadHistory(state.historyDays, { refresh: Boolean(chart) }),
    loadYear(),
  ]);
  if (!navigator.onLine) notify(t("offline.plain"));
  else if (state.rateDate && state.rateDate === before) notify(t("refresh.latest", { date: state.rateDate }));
}

/* ---------- more menu ---------- */

// Keyboard shortcuts (devices with a mouse), add to home screen (when the
// install card applies), data sources and notes (the footer), GitHub.
const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");

function initMoreMenu() {
  const menu = M3.menu(el("more-btn"), el("more-menu"));
  menu.addEventListener("beforeopen", () => {
    el("more-shortcuts").hidden = !finePointer.matches;
    el("more-install").hidden = el("install-section").hidden;
    el("more-github").hidden = getComputedStyle(el("github-btn")).display !== "none"; // in the app bar
  });
  menu.addEventListener("select", (e) => {
    const item = e.detail;
    if (item.id === "more-shortcuts") {
      shortcutsDialog.open();
    } else if (item.id === "more-install") {
      if (installPrompt) el("install-btn").click();
      else el("install-section").scrollIntoView({ behavior: motionOK() ? "smooth" : "auto", block: "center" });
    } else if (item.id === "more-about") {
      el("site-footer").scrollIntoView({ behavior: motionOK() ? "smooth" : "auto", block: "start" });
    }
  });
}

/* ---------- language ---------- */

function initLanguage() {
  const menu = M3.menu(el("lang-btn"), el("lang-menu"));
  menu.value = langChoice();
  menu.addEventListener("change", () => setLang(menu.value));
  // Re-render everything built in JS; static text is handled by applyI18n().
  document.addEventListener("langchange", () => {
    renderBoardText();
    if (state.cnyToJpy) {
      renderRateLine(false);
      renderChange();
      runCalculator(0);
      renderRank();
    } else {
      const [from, to] = currentPair();
      setAmountLabel(from);
      el("calc-result-label").textContent = t("calc.result", { cur: to });
    }
    if (chart) renderChart();
    if (el("offline-banner").classList.contains("is-shown")) setOffline(true);
    if (!el("install-chrome").hidden) el("install-chrome").href = chromeIntentUrl(); // ?lang= changed
    readAmount();
    renderSaved();
    renderDate();
  });
}

/* ---------- init ---------- */

window.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initLanguage();
  initReveal();
  initOffline();
  initInstall();
  initAmountField();
  initSaved();
  initDateLookup();
  initShortcuts();
  initMoreMenu();
  M3.pullToRefresh(pullRefresh);
  readShareParams();
  placeCurrencies();
  el("copy-btn").addEventListener("click", copyResult);
  el("share-btn").addEventListener("click", shareResult);
  el("calc-result").addEventListener("click", copyResult);
  el("swap-btn").addEventListener("click", toggleDirection);
  const range = M3.buttonGroup(el("range-group"));
  range.addEventListener("change", () => loadHistory(Number(range.value)));
  // Touch: tapping anywhere outside the chart dismisses the tooltip.
  document.addEventListener("pointerdown", (e) => {
    if (chart && !chart.svg.contains(e.target)) hideTooltip();
  });
  window.addEventListener("resize", debounce(() => renderChart(), 150));

  loadRate();
  loadHistory(90);
  loadYear();
});

// Offline support and "add to home screen" (see sw.js).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => { /* optional */ });
  });
}
