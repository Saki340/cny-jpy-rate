// Interface languages: Simplified Chinese, Japanese, English.
//
// Choice order: ?lang= in the URL (shared / search-engine links), then the
// visitor's saved choice, then the device languages (zh-* → zh, ja-* → ja),
// and English for everyone else.
//
// Static text in index.html is marked with data-i18n (text), data-i18n-html
// (text with links) and data-i18n-attr="attr:key;attr:key". Text built in
// app.js goes through t(). The dictionaries (LANGS, I18N) are in
// i18n-strings.js; the Worker applies the same markers when it serves
// /?lang=ja and /?lang=en, and applyI18n() repeats them in the browser.

const LANG_KEY = "lang-pref";

function readLangPref() {
  try { return localStorage.getItem(LANG_KEY); } catch { return null; }
}

function saveLangPref(value) {
  try {
    if (value) localStorage.setItem(LANG_KEY, value);
    else localStorage.removeItem(LANG_KEY);
  } catch { /* ignore */ }
}

function deviceLang() {
  const list = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ""];
  for (const tag of list) {
    const base = String(tag).toLowerCase().split("-")[0];
    if (base in LANGS) return base;
  }
  return "en";
}

function urlLang() {
  const value = new URLSearchParams(location.search).get("lang");
  return value && value in LANGS ? value : null;
}

// The language in effect, and whether it was picked by the visitor ("pref")
// or follows the device ("auto").
let currentLang = urlLang() || (readLangPref() in LANGS ? readLangPref() : null) || deviceLang();

// What the menu shows as selected: a language fixed by the URL or saved by
// the visitor, otherwise "auto".
function langChoice() {
  const saved = readLangPref();
  return urlLang() || (saved in LANGS ? saved : "auto");
}

function t(key, params) {
  let text = I18N[currentLang][key] ?? I18N.zh[key] ?? key;
  if (params && typeof text === "string") {
    text = text.replace(/\{(\w+)\}/g, (m, name) => (name in params ? params[name] : m));
  }
  return text;
}

function locale() {
  return LANGS[currentLang].locale;
}

// Applies the dictionary to the static page and the document metadata.
function applyI18n(root = document) {
  document.documentElement.lang = LANGS[currentLang].htmlLang;
  document.title = t("doc.title");
  document.querySelector('meta[name="description"]')?.setAttribute("content", t("doc.description"));
  document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute("content", t("doc.siteName"));
  const manifest = document.querySelector('link[rel="manifest"]');
  if (manifest && manifest.getAttribute("href") !== LANGS[currentLang].manifest) manifest.setAttribute("href", LANGS[currentLang].manifest);
  root.querySelectorAll("[data-i18n]").forEach((node) => { node.textContent = t(node.dataset.i18n); });
  root.querySelectorAll("[data-i18n-html]").forEach((node) => { node.innerHTML = t(node.dataset.i18nHtml); });
  root.querySelectorAll("[data-i18n-attr]").forEach((node) => {
    for (const pair of node.dataset.i18nAttr.split(";")) {
      const [attr, key] = pair.split(":").map((s) => s.trim());
      if (attr && key) node.setAttribute(attr, t(key));
    }
  });
}

// Switch language. `choice` is a language code or "auto" (follow the device).
// The address bar keeps ?lang= in step, so the URL being shared or bookmarked
// opens in the same language; Chinese (the default) and "auto" need none.
function setLang(choice) {
  saveLangPref(choice === "auto" ? null : choice);
  currentLang = choice === "auto" ? deviceLang() : choice;
  const url = new URL(location.href);
  if (choice === "auto" || currentLang === "zh") url.searchParams.delete("lang");
  else url.searchParams.set("lang", currentLang);
  history.replaceState(null, "", url.pathname + url.search + url.hash);
  applyI18n();
  document.dispatchEvent(new CustomEvent("langchange", { detail: { lang: currentLang } }));
}

// Translate as early as possible (this script runs at the end of <body>,
// after the markup is parsed) so other languages do not flash Chinese first.
applyI18n();
