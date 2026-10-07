// Behaviour for the Material 3 components in m3.css (no dependencies).
//
//   M3.snackbar(message, { action, onAction })
//                                      show a snackbar (4 s, like SnackbarDuration.Short;
//                                      10 s with an action, like SnackbarDuration.Long)
//   M3.dialog(el)                      modal dialog on <dialog>; returns { open, close }
//   M3.pullToRefresh(onRefresh)        pull down at the top of the page (touch) to
//                                      refresh; onRefresh returns a promise
//   M3.buttonGroup(el)                 connected button group as a radio group;
//                                      el.value, "change" event
//   M3.menu(trigger, menu)             menu anchored to a button. Radio items
//                                      (menuitemradio): menu.value, "change";
//                                      action items (menuitem): "select" event
//                                      with the item; "beforeopen" event
//   M3.setLabel(field, text)           outlined text field label
//
// Ripples and tooltips are wired up automatically for .m3-interactive and
// [data-tooltip] elements.

const M3 = (() => {
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- ripple ---------- */

  function ripple(e) {
    const host = e.target.closest(".m3-interactive");
    if (!host || host.disabled || e.button > 0 || reduced()) return;
    let layer = host.querySelector(":scope > .m3-ripple");
    if (!layer) {
      layer = document.createElement("span");
      layer.className = "m3-ripple";
      host.prepend(layer);
    }
    const rect = host.getBoundingClientRect();
    const size = Math.hypot(rect.width, rect.height) * 2;
    const wave = document.createElement("span");
    wave.className = "m3-ripple__wave";
    wave.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left - size / 2}px;top:${e.clientY - rect.top - size / 2}px`;
    layer.append(wave);
    const release = () => {
      wave.classList.add("is-out");
      setTimeout(() => wave.remove(), 460);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
  }
  document.addEventListener("pointerdown", ripple);

  /* ---------- top app bar: medium flexible, collapsing on scroll ---------- */

  // CSS cubic-bezier() as a function of progress (for TopTitleAlphaEasing).
  function cubicBezier(x1, y1, x2, y2) {
    const at = (t, a, b) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
    return (p) => {
      if (p <= 0) return 0;
      if (p >= 1) return 1;
      let lo = 0, hi = 1, t = p;
      for (let i = 0; i < 20; i++) {
        t = (lo + hi) / 2;
        if (at(t, x1, x2) < p) lo = t; else hi = t;
      }
      return at(t, y1, y2);
    };
  }
  const topTitleEasing = cubicBezier(0.8, 0, 0.8, 0.15);

  function initAppBars() {
    const bar = document.querySelector(".m3-top-app-bar");
    if (!bar) return;
    const expanded = document.querySelector(".m3-top-app-bar__expanded");
    const small = bar.querySelector(".m3-top-app-bar__title");
    let last = -1;
    const update = () => {
      const range = expanded ? expanded.offsetHeight : 0;
      const f = range ? Math.min(Math.max(window.scrollY / range, 0), 1) : window.scrollY > 0 ? 1 : 0;
      if (f === last) return;
      last = f;
      const topAlpha = expanded ? topTitleEasing(f) : 1;
      bar.style.setProperty("--collapsed", f.toFixed(3));
      bar.style.setProperty("--top-title-alpha", topAlpha.toFixed(3));
      expanded?.style.setProperty("--expanded-alpha", (1 - f).toFixed(3));
      // Content is under the bar once it has fully collapsed.
      bar.classList.toggle("is-scrolled", f >= 1);
      // Like Compose, only the visible title is exposed to screen readers.
      if (expanded && small) small.toggleAttribute("aria-hidden", topAlpha < 0.5);
    };
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
  }

  /* ---------- snackbar ---------- */

  let snackTimer = 0;
  function snackbar(message, { action, onAction } = {}) {
    let bar = document.querySelector(".m3-snackbar");
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "m3-snackbar";
      bar.setAttribute("role", "status");
      bar.setAttribute("aria-live", "polite");
      document.body.append(bar);
    }
    const hide = () => bar.classList.remove("is-visible");
    bar.replaceChildren();
    const text = document.createElement("span");
    text.className = "m3-snackbar__text";
    text.textContent = message;
    bar.append(text);
    if (action) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "m3-snackbar__action m3-interactive";
      button.textContent = action;
      button.addEventListener("click", () => { hide(); onAction?.(); });
      bar.append(button);
    }
    bar.classList.remove("is-visible");
    void bar.offsetWidth;
    bar.classList.add("is-visible");
    clearTimeout(snackTimer);
    snackTimer = setTimeout(hide, action ? 10000 : 4000);
  }

  /* ---------- dialog ----------
   * Native <dialog> (modal, focus trap, Escape) with the M3 open/close
   * motion; clicking the scrim closes it. */

  function dialog(d) {
    const close = (value = "") => {
      if (!d.open || d.classList.contains("is-closing")) return;
      const done = () => { d.classList.remove("is-closing"); d.close(value); };
      if (reduced()) { done(); return; }
      d.classList.add("is-closing");
      d.addEventListener("animationend", done, { once: true });
      setTimeout(() => { if (d.open) done(); }, 400);
    };
    d.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
    d.addEventListener("click", (e) => { if (e.target === d) close(); });
    return { open: () => { hideTooltip(); d.showModal(); }, close };
  }

  /* ---------- connected button group (single selection) ---------- */

  function buttonGroup(group) {
    const buttons = () => [...group.querySelectorAll(".m3-toggle")];
    const sync = () => {
      for (const b of buttons()) {
        const on = b.dataset.value === group.dataset.value;
        b.setAttribute("aria-checked", String(on));
        b.tabIndex = on ? 0 : -1;
      }
    };
    Object.defineProperty(group, "value", {
      get: () => group.dataset.value,
      set: (v) => { group.dataset.value = String(v); sync(); },
    });
    const choose = (b) => {
      if (b.dataset.value === group.dataset.value) return;
      group.value = b.dataset.value;
      group.dispatchEvent(new Event("change", { bubbles: true }));
    };
    group.addEventListener("click", (e) => {
      const b = e.target.closest(".m3-toggle");
      if (b) choose(b);
    });
    group.addEventListener("keydown", (e) => {
      const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
      if (!step) return;
      e.preventDefault();
      const list = buttons();
      const at = list.indexOf(document.activeElement);
      const next = list[(at + step + list.length) % list.length];
      next.focus();
      choose(next);
    });
    sync();
    return group;
  }

  /* ---------- menu ---------- */

  function menu(trigger, panel) {
    const items = () => [...panel.querySelectorAll(".m3-menu__item")].filter((i) => !i.hidden);
    let open = false;

    const place = () => {
      const r = trigger.getBoundingClientRect();
      const width = panel.offsetWidth;
      const right = Math.max(8, window.innerWidth - r.right);
      panel.style.right = `${Math.min(right, window.innerWidth - width - 8)}px`;
      panel.style.top = `${r.bottom + 4}px`;
    };
    const sync = () => {
      for (const item of panel.querySelectorAll('[role="menuitemradio"]')) item.setAttribute("aria-checked", String(item.dataset.value === panel.dataset.value));
    };
    const show = (focusFirst) => {
      if (open) return;
      open = true;
      panel.dispatchEvent(new Event("beforeopen"));
      for (const group of panel.querySelectorAll(".m3-menu__group")) {
        group.hidden = !group.querySelector(".m3-menu__item:not([hidden])");
      }
      place();
      panel.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
      hideTooltip();
      const target = items().find((i) => i.getAttribute("aria-checked") === "true") || items()[0];
      if (focusFirst) target.focus({ preventScroll: true });
      panel.dispatchEvent(new Event("open"));
    };
    const close = (refocus) => {
      if (!open) return;
      open = false;
      panel.classList.remove("is-open");
      trigger.setAttribute("aria-expanded", "false");
      if (refocus) trigger.focus({ preventScroll: true });
    };

    Object.defineProperty(panel, "value", {
      get: () => panel.dataset.value,
      set: (v) => { panel.dataset.value = String(v); sync(); },
    });
    Object.defineProperty(panel, "open", { get: () => open });
    panel.close = () => close(false);

    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", "false");
    trigger.addEventListener("click", () => (open ? close(false) : show(true)));
    trigger.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); show(true); }
    });
    panel.addEventListener("click", (e) => {
      const item = e.target.closest(".m3-menu__item");
      if (!item) return;
      if (item.getAttribute("role") !== "menuitemradio") {
        // Action item (a link navigates by itself).
        close(item.tagName !== "A");
        panel.dispatchEvent(new CustomEvent("select", { detail: item }));
        return;
      }
      const changed = item.dataset.value !== panel.dataset.value;
      panel.value = item.dataset.value;
      close(true);
      if (changed) panel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    panel.addEventListener("keydown", (e) => {
      const list = items();
      const at = list.indexOf(document.activeElement);
      const moves = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: list.length - 1 };
      if (e.key in moves) {
        e.preventDefault();
        list[(moves[e.key] + list.length) % list.length].focus();
      } else if (e.key === "Escape") {
        e.preventDefault();
        close(true);
      } else if (e.key === "Tab") {
        close(false);
      }
    });
    document.addEventListener("pointerdown", (e) => {
      if (open && !panel.contains(e.target) && !trigger.contains(e.target)) close(false);
    });
    window.addEventListener("resize", () => close(false));
    window.addEventListener("scroll", () => { if (open) place(); }, { passive: true });
    sync();
    return panel;
  }

  /* ---------- plain tooltip ----------
   * Shown on mouse hover (after a short delay) and on keyboard focus; never on
   * touch, and not while the element's menu is open. Text: data-tooltip. */

  let tip = null;
  let tipTimer = 0;
  let tipFor = null;

  function showTooltip(target) {
    const text = target.dataset.tooltip;
    if (!text || target.getAttribute("aria-expanded") === "true") return;
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "m3-tooltip";
      tip.setAttribute("role", "tooltip");
      tip.id = "m3-tooltip";
      document.body.append(tip);
    }
    tip.textContent = text;
    tipFor = target;
    const r = target.getBoundingClientRect();
    const w = tip.offsetWidth;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    tip.style.left = `${left}px`;
    tip.style.top = `${r.bottom + 4}px`;
    tip.style.transformOrigin = `${r.left + r.width / 2 - left}px top`;
    tip.classList.add("is-visible");
  }

  function hideTooltip() {
    clearTimeout(tipTimer);
    tipFor = null;
    tip?.classList.remove("is-visible");
  }

  document.addEventListener("pointerover", (e) => {
    const target = e.target.closest?.("[data-tooltip]");
    if (!target || e.pointerType !== "mouse" || target === tipFor) return;
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => showTooltip(target), 500);
  });
  document.addEventListener("pointerout", (e) => {
    const target = e.target.closest?.("[data-tooltip]");
    if (target && !target.contains(e.relatedTarget)) hideTooltip();
  });
  document.addEventListener("focusin", (e) => {
    const target = e.target.closest?.("[data-tooltip]");
    if (target && target.matches(":focus-visible")) showTooltip(target);
  });
  document.addEventListener("focusout", hideTooltip);
  document.addEventListener("pointerdown", hideTooltip);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideTooltip(); });

  /* ---------- pull to refresh ----------
   * PullToRefreshDefaults (Expressive): the pull counts half (DragMultiplier
   * 0.5); 80dp is both the threshold and the indicator's travel
   * (PositionalThreshold, IndicatorMaxDistance). The indicator is the contained
   * loading indicator (48dp, primary-container, shape on-primary-container):
   * while pulling it morphs with the distance and, past the threshold,
   * rotates; while refreshing it morphs and spins on its own. Touch only, and
   * only when the page is scrolled to the very top. */

  function pullToRefresh(onRefresh) {
    if (!("ontouchstart" in window)) return;
    const THRESHOLD = 80;
    const box = document.createElement("div");
    box.className = "m3-pull-refresh";
    box.setAttribute("aria-hidden", "true");
    box.innerHTML = '<span class="m3-pull-refresh__shape"></span>';
    document.body.append(box);
    document.documentElement.classList.add("has-pull-refresh");

    let startY = null;
    let pulling = false;
    let busy = false;
    let distance = 0;
    const show = (fraction) => {
      box.style.setProperty("--p", fraction.toFixed(3));
      box.classList.add("is-active");
    };
    const hide = () => {
      box.classList.remove("is-active", "is-refreshing");
      box.style.setProperty("--p", "0");
    };

    document.addEventListener("touchstart", (e) => {
      if (busy || window.scrollY > 0 || e.touches.length !== 1 || e.target.closest("dialog, .m3-menu")) return;
      startY = e.touches[0].clientY;
      distance = 0;
    }, { passive: true });
    document.addEventListener("touchmove", (e) => {
      if (startY === null) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0 || window.scrollY > 0) {
        if (pulling) hide();
        pulling = false;
        startY = null;
        return;
      }
      pulling = true;
      e.preventDefault(); // instead of the page bouncing or the browser reloading
      distance = dy * 0.5;
      show(distance / THRESHOLD);
    }, { passive: false });
    const release = async () => {
      startY = null;
      if (!pulling) return;
      pulling = false;
      if (distance < THRESHOLD) {
        hide();
        return;
      }
      busy = true;
      show(1);
      box.classList.add("is-refreshing");
      const minimum = new Promise((r) => setTimeout(r, 700)); // long enough to be seen
      try { await Promise.all([onRefresh(), minimum]); } finally {
        hide();
        busy = false;
      }
    };
    document.addEventListener("touchend", release);
    document.addEventListener("touchcancel", release);
  }

  /* ---------- outlined text field ---------- */

  function setLabel(field, text) {
    field.querySelector(".m3-text-field__label").textContent = text;
    field.querySelector(".m3-text-field__outline legend > span").textContent = text;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initAppBars);
  else initAppBars();

  return { snackbar, dialog, buttonGroup, menu, setLabel, hideTooltip, pullToRefresh };
})();
