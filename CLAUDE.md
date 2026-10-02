# CLAUDE.md

JPY ⇄ CNY 汇率板。单个 Cloudflare Worker + 静态资源，无构建步骤、无 npm 依赖。

- 线上：https://rate.anontokyo.vip
- 仓库：https://github.com/Saki340/cny-jpy-rate （`main` 分支）。推送后由 Cloudflare Workers Builds 自动执行 `npx wrangler deploy`。
- **以 GitHub 为准**：开始改动前先 `git pull`。

## 结构

- `worker.js` — Worker 入口，处理 `/api/rate`、`/api/history`。两者共用同一数据源：主源 Frankfurter（欧洲央行参考汇率），失败时用 fawazahmed0 currency-api。**不要再接入 Yahoo 等条款不允许商用/公开展示的数据源。**其余请求交给 `env.ASSETS`。
- `wrangler.toml` — `public/` 为静态资源目录，`/api/*` 先走 Worker；`[observability]` 开启 Workers Logs（不要删，否则部署会把日志关掉）。
- `public/index.html` / `app.js` / `style.css` — 前端，原生 JS，无打包；走势图为手写 SVG。
- `public/vendor/` — 自托管的 mdui 2.1.5 与字体。**不要改回 unpkg / Google Fonts 等外部 CDN**（大陆访问不稳定）。
- `docs/llms-full.txt` — mdui 2 官方完整文档（本地参考，不部署）。

## 界面规范：必须遵循 mdui 2

- 所有 UI 使用 mdui 2（Material Design 3 Web Components），引入本地的 `vendor/mdui/mdui.css` 与 `mdui.global.js`。
- 写/改任何组件前，先在 `docs/llms-full.txt` 中查该组件的章节（按 `# 按钮组件 Button`、`# 卡片组件 Card`、`# 分段按钮组件 SegmentedButton`、`# 文本框组件 TextField`、`# 布局组件 Layout`、`# 顶部应用栏组件 TopAppBar`、`# 深色模式`、`# 动态配色`、`# 设计令牌` 等一级标题 grep），按官方属性、事件、CSS 变量的写法实现，不要凭记忆。
- 颜色、字号、圆角、阴影优先用 mdui 设计令牌（`--mdui-color-*`、`--mdui-typescale-*` 等），保证浅色/深色主题都正确；避免硬编码颜色。
- **颜色令牌是 `r, g, b` 三元组，必须写成 `rgb(var(--mdui-color-xxx))`**；直接写 `var(--mdui-color-xxx)` 是无效值，深色模式会坏。项目自定义颜色（`--app-color-*`）也遵循同样格式，并在 `style.css` 顶部同时定义浅色和深色两套。
- 只使用文档中列出的组件 CSS 自定义属性 / CSS Part，不要编造变量名（如 `--mdui-card-container-color` 并不存在）。
- 单选分段按钮组：再次点击已选中项会取消选择（value 变为空），用 `app.js` 里的 `keepSelection()` 恢复。
- Web Components 不能自闭合；属性改动是异步渲染的（需要时 `await el.updateComplete`）。
- 主题：`<html>` 上的 `mdui-theme-light|dark|auto`，用户选择存在 `localStorage`（键 `theme-pref`）。

## 开发

- 本地预览：`npx wrangler dev`（需要外网访问上游汇率 API）；`.claude/launch.json` 已配置 `wrangler-dev`，端口 8787。
- 改动后在浏览器里分别检查浅色、深色和手机宽度（375px）。
- 本机为 Windows / PowerShell 5.1；仓库设置了 `core.autocrlf=false`，文件保持 LF。
- 目标用户在中国大陆和日本（及全球）：新增外部资源前考虑大陆的可达性，优先自托管。
- 用户可见文案为简体中文；提交说明也用中文。
