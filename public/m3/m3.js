// Behaviour for the Material 3 components in m3.css (no dependencies).
//
//   M3.snackbar(message)               show a snackbar (4 s, like SnackbarDuration.Short)
//   M3.buttonGroup(el)                 connected button group as a radio group;
//                                      el.value, "change" event
//   M3.menu(trigger, menu)             menu anchored to a button; menu.value,
//                                      "change" event, menu.open / close()
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

  /* ---------- top app bar: container colour while content is under it ---------- */

  function initAppBars() {
    const bars = document.querySelectorAll(".m3-top-app-bar");
    const update = () => bars.forEach((bar) => bar.classList.toggle("is-scrolled", window.scrollY > 0));
    window.addEventListener("scroll", update, { passive: true });
    update();
  }

  /* ---------- snackbar ---------- */

  let snackTimer = 0;
  function snackbar(message) {
    let bar = document.querySelector(".m3-snackbar");
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "m3-snackbar";
      bar.setAttribute("role", "status");
      bar.setAttribute("aria-live", "polite");
      document.body.append(bar);
    }
    bar.textContent = message;
    bar.classList.remove("is-visible");
    void bar.offsetWidth;
    bar.classList.add("is-visible");
    clearTimeout(snackTimer);
    snackTimer = setTimeout(() => bar.classList.remove("is-visible"), 4000);
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
    const items = () => [...panel.querySelectorAll(".m3-menu__item")];
    let open = false;

    const place = () => {
      const r = trigger.getBoundingClientRect();
      const width = panel.offsetWidth;
      const right = Math.max(8, window.innerWidth - r.right);
      panel.style.right = `${Math.min(right, window.innerWidth - width - 8)}px`;
      panel.style.top = `${r.bottom + 4}px`;
    };
    const sync = () => {
      for (const item of items()) item.setAttribute("aria-checked", String(item.dataset.value === panel.dataset.value));
    };
    const show = (focusFirst) => {
      if (open) return;
      open = true;
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

  /* ---------- outlined text field ---------- */

  function setLabel(field, text) {
    field.querySelector(".m3-text-field__label").textContent = text;
    field.querySelector(".m3-text-field__outline legend > span").textContent = text;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initAppBars);
  else initAppBars();

  return { snackbar, buttonGroup, menu, setLabel, hideTooltip };
})();
