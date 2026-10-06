# CLAUDE.md

JPY ⇄ CNY 汇率板。单个 Cloudflare Worker + 静态资源，无构建步骤、无 npm 依赖。

- 线上：https://rate.anontokyo.vip
- 仓库：https://github.com/Saki340/cny-jpy-rate （`main` 分支）。推送后由 Cloudflare Workers Builds 自动执行 `npx wrangler deploy`。
- **以 GitHub 为准**：开始改动前先 `git pull`。

## 结构

- `worker.js` — Worker 入口，处理 `/api/rate`（含前一个公布日，用于「较前一日」；缓存 10 分钟）、`/api/history`（缓存 1 小时）。两者共用同一数据源：主源 Frankfurter（欧洲央行参考汇率），失败时用 fawazahmed0 currency-api。**不要再接入 Yahoo 等条款不允许商用/公开展示的数据源。**其余请求交给 `env.ASSETS`。
- `wrangler.toml` — `public/` 为静态资源目录，`/api/*` 先走 Worker；`[observability]` 开启 Workers Logs（不要删，否则部署会把日志关掉）。
- `public/index.html` / `app.js` / `style.css` — 前端，原生 JS，无打包；走势图为手写 SVG。
- `public/i18n.js` — 界面文案（简体中文 / 日本語 / English）与语言切换。见下方「多语言」。
- `public/expressive.css` / `expressive.js` — M3 Expressive 层：弹簧动效令牌、连接式按钮组、波浪进度条、形状变形加载指示器、装饰形状（见下）。
- `public/manifest.webmanifest` / `sw.js` / `icons/` — 可安装（添加到主屏幕）与离线；`sw.js` 全部网络优先，失败才用缓存，不要改成缓存优先。缓存返回的响应带 `X-From-Cache: 1`，页面据此显示离线提示（`noteCached()`）。
- 安装卡片（`initInstall()`）：Chromium 用 `beforeinstallprompt` 显示「安装」按钮，iOS 显示「分享 → 添加到主屏幕」说明；已安装或 30 天内点过「不用了」则不显示。
- 提示信息统一用 mdui 的 `snackbar` 函数（`app.js` 的 `notify()`）。
- 分享链接参数 `?amount=…&from=JPY|CNY`（`readShareParams()`），读取后从地址栏移除。
- 里程表数字的滚动列设了 `user-select: none`，复制时取 `.sr-only` 里的纯文本；不要去掉，否则复制出来是 0–9 一串。
- `public/vendor/` — 自托管的 mdui 2.1.5 与字体（Google Sans Flex ASCII 子集、Material Icons）。**不要改回 unpkg / Google Fonts 等外部 CDN**（大陆访问不稳定）。
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

## M3 Expressive 层（`expressive.css` / `expressive.js`）

mdui 2 与 Google 的 Material Web 都没有实现 M3 Expressive，本站按 m3.material.io 规范手工补充：

- **动效用弹簧令牌** `--ex-{fast,default,slow}-{spatial,effects}`（及 `-dur`），数值来自官网 Motion > Specs 的「Web: Convert springs to curves」。位置/尺寸/形状用 spatial（有回弹），颜色/透明度用 effects（无回弹）；**跟随指针移动的东西（悬浮提示、光标）不要用有回弹的曲线**。JS 里的 Web Animations 用 `app.js` 的 `SPRING_*` 常量。
- **按钮组**：仍用 mdui 分段按钮（保留 ripple、键盘与无障碍），通过 `.connected-group` 从外部改成连接式按钮组外观；不要改回手写按钮。
- **卡片圆角层级**：主视觉卡片（今日汇率）extra-large，其余卡片 large，统一用 mdui-card 的 `--shape-corner`。
- **卡片色块**：每张卡片都是 filled 容器，用 `--card-bg` / `--card-on`（三元组）指定：今日汇率 primary-container、计算器自定义青绿色（`--app-color-calc-container`，style.css 顶部浅/深两套）、走势 secondary-container、万事达 surface-container-highest。卡片内文字、图表描边都从这两个变量取色，换色只改这一处。
- **数字**：今日汇率用 `odometer()`（每位数字是 0–9 的滚动列）；计算结果用 `tweenNumber()` + 轻微 `pop()`。
- **走势图**：首次出现用画线动画（`draw`），之后切换范围/方向/新数据都用 `morph`（旧线变形为新线，不重画）；在屏幕外时动画暂停到可见（`is-waiting`）。
- **区块入场**：`html.js` 下各 section 滚动到可见才播放入场动画。
- **形状**：由 `ExpressiveShapes.polygon(name)` 生成同点数的 `polygon()`，可直接用 clip-path 过渡变形；新形状加在 `radius` 表里。
- **字体**：Google Sans Flex 是唯一的拉丁字体（数字用 tabular-nums）；显示文字和关键数字用 `font-variation-settings: "ROND" 100`。子集只含 ASCII 和 · − ± ⇄，新增符号需重新下载子集。
- 所有装饰性动画都受 `prefers-reduced-motion` 控制（`style.css` 末尾）。

## 开发

- 本地预览：`npx wrangler dev`（需要外网访问上游汇率 API）；`.claude/launch.json` 已配置 `wrangler-dev`，端口 8787。
- 改动后在浏览器里分别检查浅色、深色和手机宽度（375px）。
- 本机为 Windows / PowerShell 5.1；仓库设置了 `core.autocrlf=false`，文件保持 LF。
- 目标用户在中国大陆和日本（及全球）：新增外部资源前考虑大陆的可达性，优先自托管。
- 页面开着时会在欧洲央行下次公布后自动刷新（`scheduleRefresh()`）；走势图若比今日汇率旧一天，前端会把今日汇率补为最后一点（`chartPoints()`），保证两处一致。
- 改了 `docs/og-image.html` 后用 README 中的 Edge 命令重新生成三张预览图（`og-image.png`、`og-image-ja.png`、`og-image-en.png`）。
- 提交说明用中文。

## 多语言（`public/i18n.js`）

- 三种语言：`zh`（默认）、`ja`、`en`。选择顺序：URL `?lang=` → 用户在菜单中的选择（`localStorage` 键 `lang-pref`）→ 设备语言（`zh-*`/`ja-*`）→ 其余一律 `en`。
- **新增或修改任何用户可见文字，三种语言都要写**：静态文字在 `index.html` 用 `data-i18n` / `data-i18n-html`（含链接）/ `data-i18n-attr="attr:key;…"` 标记；`app.js` 里用 `t(key, params)`，数字和时间用 `locale()`。不要在 HTML/JS 里写死中文。
- 切换语言会派发 `langchange` 事件，`app.js` 的 `initLanguage()` 里重绘所有 JS 生成的文字；新增动态文字要在那里加上。
- 每种语言有独立 URL（`/`、`/?lang=ja`、`/?lang=en`），Worker 用 HTMLRewriter 改写 `<head>`（lang、title、description、canonical、og）以便搜索引擎收录；`worker.js` 的 `PAGE_META` 要和 `i18n.js` 的 `doc.title` / `doc.description` 保持一致。hreflang 写在 `index.html` 和 `sitemap.xml`。
- 语言菜单：mdui-dropdown + mdui-menu（单选，选中项带勾）。**按钮必须直接作为 dropdown 的 trigger**（包在 tooltip 里菜单会定位到屏幕外），tooltip 包在整个 dropdown 外层；菜单打开时和触屏点击时取消 tooltip 的 `open` 事件。
- 菜单外观用 `.ex-menu`（`expressive.css`）改成 M3 Expressive 分组菜单，数值取自 Jetpack Compose Material 3 源码（`MenuDefaults` / `SegmentedMenuTokens`，可在 GitHub androidx/androidx 的 `compose/material3` 下查）；用 `.group-start` / `.group-end` 标出每组首尾，不要再用 `mdui-divider` 分隔。mdui 的涟漪铺满整个菜单项宿主元素，已关掉，改为在 `::part(container)` 上画状态层。
- 每种语言另有分享预览图 `og-image-{ja,en}.png` 和清单 `manifest-{ja,en}.webmanifest`（`id` 同为 `/`，是同一个 App），Worker 按 `?lang=` 改写，`applyI18n()` 在页面里同步切换。
- 日文页面优先用日文字体（`:root:lang(ja)`），否则汉字会显示成中文字形。
- **提交说明不要加 `Co-Authored-By: Claude …` 之类的署名行**，PR 描述也不要加 Claude Code 署名；README 等文档中也不要把 Claude 列为作者或贡献者。
