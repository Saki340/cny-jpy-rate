let state = {
  cnyToJpy: null,
  jpyToCny: null,
  direction: "cny2jpy", // or jpy2cny
  historyDays: 90,
  chart: null,
};

const el = (id) => document.getElementById(id);

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
  el("theme-toggle").textContent = theme === "light" ? "切换到夜间模式" : "切换到日间模式";
  if (state.chart) restyleChart();
}

function initTheme() {
  const saved = localStorage.getItem("theme");
  const preferred = saved || (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  applyTheme(preferred);
  el("theme-toggle").addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    applyTheme(current === "light" ? "dark" : "light");
  });
}

function restyleChart() {
  const gold = cssVar("--gold");
  const muted = cssVar("--muted");
  const grid = cssVar("--grid-line");

  state.chart.data.datasets[0].borderColor = gold;
  state.chart.data.datasets[0].backgroundColor = gold + "14"; // ~8% alpha fill
  state.chart.options.scales.x.ticks.color = muted;
  state.chart.options.scales.y.ticks.color = muted;
  state.chart.options.scales.x.grid.color = grid;
  state.chart.options.scales.y.grid.color = grid;
  state.chart.update();
}

function fmt(n, maxDigits = 4) {
  if (!isFinite(n)) return "--";
  return n.toLocaleString("zh-CN", { maximumFractionDigits: maxDigits });
}

async function loadRate() {
  const boardNote = el("board-note");
  try {
    const res = await fetch("/api/rate");
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    state.cnyToJpy = data.cny_to_jpy;
    state.jpyToCny = data.jpy_to_cny;

    el("updated").textContent = `数据日期 ${data.date} · 来源 ${data.source}`;
    renderRateLine();
    runCalculator();
  } catch (err) {
    boardNote.textContent = "汇率获取失败，请稍后刷新页面重试。";
  }
}

function renderRateLine() {
  const from = state.direction === "cny2jpy" ? "CNY" : "JPY";
  const to = state.direction === "cny2jpy" ? "JPY" : "CNY";
  const rate = state.direction === "cny2jpy" ? state.cnyToJpy : state.jpyToCny;

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
}

function runCalculator() {
  const amount = parseFloat(el("amount").value) || 0;
  const rate = state.direction === "cny2jpy" ? state.cnyToJpy : state.jpyToCny;
  if (!rate) return;
  el("calc-result").textContent = fmt(amount * rate, 2);
}

async function loadHistory(days) {
  state.historyDays = days;
  document.querySelectorAll(".range-tabs button").forEach((b) => {
    b.setAttribute("aria-pressed", String(Number(b.dataset.days) === days));
  });

  try {
    const res = await fetch(`/api/history?days=${days}`);
    const data = await res.json();
    if (!data.points || !data.points.length) throw new Error("no points");
    renderChart(data.points);
  } catch (err) {
    // leave prior chart in place if this refresh fails
  }
}

function renderChart(points) {
  const ctx = el("history-chart").getContext("2d");
  const labels = points.map((p) => p.date.slice(5)); // MM-DD
  const values = points.map((p) => p.rate);

  if (state.chart) {
    state.chart.data.labels = labels;
    state.chart.data.datasets[0].data = values;
    state.chart.update();
    return;
  }

  const gold = cssVar("--gold");
  const muted = cssVar("--muted");
  const grid = cssVar("--grid-line");

  state.chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          data: values,
          borderColor: gold,
          backgroundColor: gold + "14",
          borderWidth: 1.5,
          pointRadius: 0,
          fill: true,
          tension: 0.15,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: { color: muted, maxTicksLimit: 6, font: { family: "IBM Plex Mono", size: 11 } },
          grid: { color: grid },
        },
        y: {
          ticks: { color: muted, font: { family: "IBM Plex Mono", size: 11 } },
          grid: { color: grid },
        },
      },
    },
  });
}

async function loadMastercard() {
  const box = el("mc-result");
  box.textContent = "查询中…";
  try {
    const amount = parseFloat(el("amount").value) || 1;
    const res = await fetch(`/api/mastercard?direction=${state.direction}&amount=${amount}`);
    const data = await res.json();
    if (!data.ok) {
      box.textContent = data.error || "暂时无法获取。";
      return;
    }
    // The undocumented endpoint's response shape isn't guaranteed; show
    // whatever numeric conversion amount it returns, else the raw payload.
    const converted =
      data.data && (data.data.conversionAmount || data.data.transAmt || data.data.data);
    box.textContent = converted
      ? `约 ${fmt(Number(converted), 2)}（含 Mastercard 当日结算汇率）`
      : "已获取响应，但格式与预期不同，暂不展示。";
  } catch (err) {
    box.textContent = "暂时无法获取。";
  }
}

window.addEventListener("DOMContentLoaded", () => {
  initTheme();
  el("swap-btn").addEventListener("click", toggleDirection);
  el("amount").addEventListener("input", runCalculator);
  document.querySelectorAll(".range-tabs button").forEach((b) => {
    b.addEventListener("click", () => loadHistory(Number(b.dataset.days)));
  });
  el("mc-fetch-btn").addEventListener("click", loadMastercard);

  loadRate();
  loadHistory(90);
});
