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
- `public/m3/` — 本站自己实现的 Material 3 组件（不用任何 UI 库），见下方「界面规范」：
  - `tokens.css` — 系统设计令牌（颜色、字号、形状、状态层、动效），**由 `tools/m3-tokens.py` 从 Jetpack Compose Material 3 源码生成，不要手改**。
  - `m3.css` / `m3.js` — 顶部应用栏、按钮、图标按钮、连接式按钮组、卡片、描边文本框、菜单、提示、snackbar、涟漪。
- `public/expressive.js` — M3 形状库（装饰形状、加载指示器的形状变形）。
- `public/manifest.webmanifest` / `sw.js` / `icons/` — 可安装（添加到主屏幕）与离线；`sw.js` 全部网络优先，失败才用缓存，不要改成缓存优先。缓存返回的响应带 `X-From-Cache: 1`，页面据此显示离线提示（`noteCached()`）。
- 安装卡片（`initInstall()`）：Chromium 用 `beforeinstallprompt` 显示「安装」按钮，iOS 显示「分享 → 添加到主屏幕」说明；已安装或 30 天内点过「不用了」则不显示。
- 提示信息统一用 `M3.snackbar()`（`app.js` 的 `notify()`）。
- 分享链接参数 `?amount=…&from=JPY|CNY`（`readShareParams()`），读取后从地址栏移除。
- 里程表数字的滚动列设了 `user-select: none`，复制时取 `.sr-only` 里的纯文本；不要去掉，否则复制出来是 0–9 一串。
- `public/vendor/fonts/` — 自托管的字体（Google Sans Flex ASCII 子集、Material Symbols Rounded 子集）。**图标字体只含页面用到的图标，新增图标要按 `vendor/fonts/README.txt` 重新下载子集**，否则显示成英文单词。**不要改用 Google Fonts 等外部 CDN**（大陆访问不稳定），也不要再引入 UI 组件库。
- `tools/m3-tokens.py` — 从 GitHub androidx/androidx（固定提交）读取 Compose Material 3 的 `tokens/*.kt`，生成 `public/m3/tokens.css`。

## 界面规范：Material 3（数值以 Jetpack Compose Material 3 源码为准）

- 整体必须是 Material Design 3（Expressive）风格。**数值不要凭记忆或看图估**：查 Compose 源码 `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/` 下的 `tokens/*Tokens.kt`（Google 从设计规范生成）和组件的 `*Defaults`（如 `MenuDefaults`、`ButtonGroupDefaults`）。注意 `*Defaults` 有时会覆盖令牌（例如文字按钮的颜色是 Primary，`TextButtonTokens.LabelColor` 是错的，源码里有 TODO），以组件实际用的为准。
- 系统令牌用 `--md-sys-*`（`tokens.css`）：颜色是完整颜色值，直接 `var(--md-sys-color-primary)`；半透明用 `color-mix(in srgb, var(--x) 12%, transparent)`。项目自定义颜色（`--app-color-*`）在 `style.css` 顶部同时定义浅色和深色两套。
- 组件写在 `m3/m3.css` / `m3.js`，每个组件的注释写明对应的 Compose 令牌对象；新增组件也照此办理。状态层用 `.m3-interactive`（悬停 8%、聚焦 10%、按下 10% + 涟漪），聚焦环 3px secondary。
- 动效：Compose 的弹簧（刚度 / 阻尼比）被采样成 CSS `linear()`，即 `--md-sys-motion-spring-{fast,default,slow}-{spatial,effects}` 及 `-duration`。位置/尺寸/形状用 spatial（有回弹），颜色/透明度用 effects（无回弹）；**跟随指针移动的东西（悬浮提示、光标）用 `--follow`（不回弹）**。JS 里的 Web Animations 用 `app.js` 的 `SPRING_*`（从 CSS 令牌读取），自绘动画用 `springCurve()`。
- 主题：`<html>` 上的 `theme-light|dark|auto`，用户选择存在 `localStorage`（键 `theme-pref`）。
- 组件 API：`M3.buttonGroup(el)`（单选按钮组，`value` + `change` 事件，方向键切换）、`M3.menu(trigger, panel)`（`value` + `change`）、`M3.setLabel(field, text)`（文本框标签）、`M3.snackbar(text)`；提示框写 `data-tooltip`（触屏和菜单打开时不显示）。

## 页面细节

- **卡片圆角层级**：主视觉卡片（今日汇率）extra-large（28dp），其余卡片 large（16dp）。
- **卡片色块**：每张卡片都是 filled 容器，用 `--card-bg` / `--card-on` 指定：今日汇率 primary-container、计算器自定义青绿色（`--app-color-calc-container`，style.css 顶部浅/深两套）、走势 secondary-container、万事达 surface-container-highest。卡片内文字、文本框、图表描边都从这两个变量取色，换色只改这一处。
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
- 语言菜单：`M3.menu()`，M3 Expressive 分组菜单（`.m3-menu__group`，组间 2dp 间隙代替分隔线；选中项 tertiary-container 填色，`menuitemradio`），数值来自 `MenuDefaults` / `SegmentedMenuTokens`。
- 每种语言另有分享预览图 `og-image-{ja,en}.png` 和清单 `manifest-{ja,en}.webmanifest`（`id` 同为 `/`，是同一个 App），Worker 按 `?lang=` 改写，`applyI18n()` 在页面里同步切换。
- 日文页面优先用日文字体（`:root:lang(ja)`），否则汉字会显示成中文字形。
- **提交说明不要加 `Co-Authored-By: Claude …` 之类的署名行**，PR 描述也不要加 Claude Code 署名；README 等文档中也不要把 Claude 列为作者或贡献者。
