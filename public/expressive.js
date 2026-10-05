// Material 3 Expressive helpers (experimental branch). Loaded before app.js.
//
// Shapes: the M3 shape library (cookie, sunny, soft burst, pill, ...) is
// approximated with polar functions sampled at the same number of points, so
// any two shapes can be morphed with a plain CSS clip-path transition.

const ExpressiveShapes = (() => {
  const POINTS = 96;
  const TAU = Math.PI * 2;

  // Rounded regular polygon: blend a sharp polygon with a circle.
  const roundedPolygon = (sides, roundness) => (t) => {
    const seg = TAU / sides;
    const local = ((t % seg) + seg) % seg - seg / 2;
    const sharp = Math.cos(Math.PI / sides) / Math.cos(local);
    return sharp * (1 - roundness) + roundness;
  };
  // Superellipse with aspect ratio (pill / oval).
  const superellipse = (b, n) => (t) =>
    Math.pow(Math.pow(Math.abs(Math.cos(t)), n) + Math.pow(Math.abs(Math.sin(t) / b), n), -1 / n);
  const scallop = (lobes, depth) => (t) => 1 + depth * Math.cos(lobes * t);

  const radius = {
    circle: () => 1,
    cookie4: scallop(4, 0.16),
    cookie7: scallop(7, 0.1),
    cookie9: scallop(9, 0.08),
    cookie12: scallop(12, 0.06),
    sunny: scallop(8, 0.11),
    softBurst: (t) => 1 + 0.16 * (Math.cos(10 * t) > 0 ? Math.pow(Math.cos(10 * t), 0.6) : -Math.pow(-Math.cos(10 * t), 1.6)),
    pentagon: roundedPolygon(5, 0.3),
    pill: superellipse(0.58, 3),
    oval: superellipse(0.8, 2),
  };

  // Returns a CSS polygon() that fills a square box, centred, max radius = 1.
  function polygon(name, rotateDeg = 0) {
    const fn = radius[name];
    const rot = (rotateDeg * Math.PI) / 180;
    const raw = [];
    let max = 0;
    for (let i = 0; i < POINTS; i++) {
      const t = (i / POINTS) * TAU;
      const r = fn(t);
      const x = Math.cos(t + rot - Math.PI / 2) * r;
      const y = Math.sin(t + rot - Math.PI / 2) * r;
      max = Math.max(max, Math.abs(x), Math.abs(y));
      raw.push([x, y]);
    }
    const pts = raw.map(([x, y]) => `${(50 + (x / max) * 50).toFixed(2)}% ${(50 + (y / max) * 50).toFixed(2)}%`);
    return `polygon(${pts.join(",")})`;
  }

  // Loading indicator: soft burst -> cookie 9 -> pentagon -> pill -> sunny ->
  // cookie 4 -> oval -> back, each step on the "expressive default spatial"
  // spring curve (overshoot included), as in the M3 loading indicator.
  function installLoadingKeyframes() {
    const order = ["softBurst", "cookie9", "pentagon", "pill", "sunny", "cookie4", "oval", "softBurst"];
    const easing = "cubic-bezier(0.38, 1.21, 0.22, 1.00)";
    const frames = order.map((name, i) => {
      const pct = ((i / (order.length - 1)) * 100).toFixed(3);
      return `${pct}% { clip-path: ${polygon(name, i * 51)}; animation-timing-function: ${easing}; }`;
    });
    const style = document.createElement("style");
    style.textContent = `@keyframes ex-loading-morph { ${frames.join(" ")} }`;
    document.head.append(style);
  }

  return { polygon, installLoadingKeyframes };
})();

// Decorative shape in the rate card: each call (direction swap, theme change)
// morphs it into the next shape of the library.
const decoShapes = [
  ["cookie12", 0], ["sunny", 22.5], ["cookie9", 10], ["softBurst", 0],
  ["cookie7", 25], ["pentagon", 0], ["cookie4", 45], ["oval", 30],
];
let decoIndex = 0;
function morphDecoShape() {
  const node = document.querySelector(".deco-shape");
  if (!node) return;
  decoIndex = (decoIndex + 1) % decoShapes.length;
  node.style.setProperty("--shape", ExpressiveShapes.polygon(...decoShapes[decoIndex]));
}

// Spring curves for JS-driven animation (chart morph), evaluated like CSS
// cubic-bezier(): solve x(t) = progress for t, return y(t).
function cubicBezier(x1, y1, x2, y2) {
  const coord = (t, a, b) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  const slope = (t, a, b) => 3 * a * (1 - t) ** 2 + 6 * (b - a) * t * (1 - t) + 3 * (1 - b) * t * t;
  return (p) => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    let t = p;
    for (let i = 0; i < 8; i++) {
      const err = coord(t, x1, x2) - p;
      const d = slope(t, x1, x2);
      if (Math.abs(err) < 1e-5 || Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    return coord(Math.min(Math.max(t, 0), 1), y1, y2);
  };
}

(function initExpressive() {
  ExpressiveShapes.installLoadingKeyframes();
  // iOS Safari only applies :active (used for the press shape morph) when the
  // page has a touch listener.
  document.addEventListener("touchstart", () => {}, { passive: true });
  const ready = () => {
    const deco = document.querySelector(".deco-shape");
    if (deco) deco.style.setProperty("--shape", ExpressiveShapes.polygon(...decoShapes[0]));
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready);
  else ready();
})();
