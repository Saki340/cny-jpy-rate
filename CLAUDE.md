# CLAUDE.md

JPY ⇄ CNY 汇率板。单个 Cloudflare Worker + 静态资源，无构建步骤、无 npm 依赖。

- 线上：https://rate.anontokyo.vip
- 仓库：https://github.com/Saki340/cny-jpy-rate （`main` 分支）。推送后由 Cloudflare Workers Builds 自动执行 `npx wrangler deploy`。
- **以 GitHub 为准**：开始改动前先 `git pull`。

## 结构

- `worker.js` — Worker 入口，处理 `/api/rate`（含前一个公布日，用于「较前一日」；缓存 10 分钟）、`/api/history`（缓存 1 小时）。两者共用同一数据源：主源 Frankfurter（欧洲央行参考汇率），失败时用 fawazahmed0 currency-api。**不要再接入 Yahoo 等条款不允许商用/公开展示的数据源。**其余请求交给 `env.ASSETS`。
- `wrangler.toml` — `public/` 为静态资源目录，`/api/*` 先走 Worker；`[observability]` 开启 Workers Logs（不要删，否则部署会把日志关掉）。
- `public/index.html` / `app.js` / `style.css` — 前端，原生 JS，无打包；走势图为手写 SVG。
- `public/i18n-strings.js` — 界面文案词典（`LANGS`、`I18N`，简体中文 / 日本語 / English），只放数据；页面和 `worker.js` 共用。`public/i18n.js` — 语言选择与切换（`t()`、`applyI18n()`）。见下方「多语言」。
- `public/vendor/petal.js` — [petal-elements](https://github.com/Saki340/petal-elements)（Lit Web 组件，标签前缀 `petal-`，变量沿用 `--md-*`）的打包文件，由 `tools/build-petal.mjs` 生成（先在 petal 仓库 `npm run build`，再 `node tools/build-petal.mjs`；只打包站点用到的组件，新增组件在脚本的列表里加一行）。重新生成后把 `index.html`、`404.html`、`sw.js`（`PRECACHE`）里的 `petal.js?v=` 一起加 1。**不要手改**。每个组件的用法见 petal 仓库 `docs/components/*.md`。
- `public/m3/` — 颜色等设计令牌，见下方「界面规范」：
  - `tokens.css` — 系统设计令牌（颜色、字号、形状、状态层、动效），**由 `tools/m3-tokens.py` 从 Jetpack Compose Material 3 源码生成，不要手改**。
- `public/expressive.js` — M3 形状库（装饰形状、加载指示器的形状变形）。
- `public/manifest.webmanifest` / `sw.js` / `icons/` — 可安装（添加到主屏幕）与离线；`sw.js` 全部网络优先，失败才用缓存，不要改成缓存优先；页面按「路径 + ?lang=」缓存一份；改动缓存结构时把 `CACHE` 的版本号加 1，旧缓存会在激活时删除。缓存返回的响应带 `X-From-Cache: 1`，页面据此显示离线提示（`noteCached()`）。
- 安装卡片（`initInstall()`）：Chromium 用 `beforeinstallprompt` 显示「安装」按钮，iOS 显示「分享 → 添加到主屏幕」说明；安卓上 Chrome 以外的浏览器（按 `userAgentData.brands` 判断）另显示「建议用 Chrome 安装」的提示和「用 Chrome 打开」（intent 链接）：三星浏览器等自己打包的 APK 可能被 Play Protect 警告「为旧版 Android 设计」，Chrome 由 Google 生成的 WebAPK 不会。已安装或 30 天内点过「不用了」则不显示。
- 提示信息统一用 `notify()`（`app.js`，驱动页面里唯一的 `<petal-snackbar>`，带 `action` 时 10 秒）。
- 分享链接参数 `?amount=…&from=JPY|CNY`（`readShareParams()`），读取后从地址栏移除；manifest 的 shortcuts 也用 `?from=`。
- 金额框是文本框，支持简单算式（`evaluateAmount()`，手写递归下降解析，不要用 `eval`）；换算用 `readAmount()` / `lastAmount`（算式写到一半时保留上一个可计算的值），不要直接读输入框。
- 按日期查汇率：`/api/day?date=`（2005-01-03 起，周末节假日由 Frankfurter 返回之前最近的工作日，过去的日期缓存 30 天）；前端 `lookupDate()` / `renderDate()`。
- 走势图的 30 日均线（`movingAverage()`，按日历日、用近一年数据补足窗口），只作统计展示。
- 键盘快捷键（`initShortcuts()`）：`/` `S` `1`–`4` `D` `?`；输入框中、对话框或菜单打开时不响应；说明对话框只在宽屏、有鼠标的设备上提供入口。
- 记住上次的换算方向（`direction-pref`，只在点切换时保存；分享链接的 `?from=` 优先但不保存）。
- 浏览器地址栏颜色（两个 `theme-color`，分浅色/深色）跟随顶部应用栏：滚动后为 surface-container（`syncThemeColor()`）。
- 常用金额（`saved-amounts`，localStorage，最多 10 个；计算器金额框右侧有两个尾部图标（`.amount-actions` 包在一个插槽里，`--md-outlined-text-field-trailing-icon-size: 64px` 留出位置）：「清除」`clearAmount()`（有内容时才显示）和「存为常用金额」按钮 `saveCurrentAmount()`，后者打开同一个添加对话框，算式未完成、已存过同币种同金额或已满时只提示不打开）；今日汇率在近一年的位置（`renderRank()`，单独取 365 天数据）：只陈述统计（较高 / 中间 / 较低水平），**不要写「划算」「建议换钱」之类的判断**，避免被视为投资建议。
- 页脚有数据来源（含「Source: ECB statistics」和交叉汇率说明，欧洲央行的再利用条件）、隐私说明和商标声明；改动相关功能时同步更新。
- 里程表数字的滚动列设了 `user-select: none`，复制时取 `.sr-only` 里的纯文本；不要去掉，否则复制出来是 0–9 一串。
- `public/vendor/fonts/` — 自托管的字体（Google Sans Flex ASCII 子集、Material Symbols Rounded 子集）。**图标字体只含页面用到的图标，新增图标要按 `vendor/fonts/README.txt` 重新下载子集**，否则显示成英文单词。字体文件缓存一周（`public/_headers`），网址带 `?v=`：**换了字体文件就要把 `style.css` 和 `index.html` 预加载里的 `?v=` 一起加 1**。
- 图标用 `<petal-icon aria-hidden="true">&#xe8e2;</petal-icon>`：**写 Material Symbols 的码点，不写图标名**（页面字体是子集，码点保留；图标名会变成页面文字，搜索结果和标题里会出现 `sync_alt` 之类的词）。码点表见 google/material-design-icons 的 `MaterialSymbolsRounded[FILL,GRAD,opsz,wght].codepoints`；JS 里用 `app.js` 的 `ICON`。字体通过 `--md-icon-font` 指定，选中 / 展开时在父元素设 `--md-icon-fill: 1`。
- 不存在的路径返回 `public/404.html`（`wrangler.toml` 的 `not_found_handling`），三种语言在页面内判断。**不要改用 Google Fonts 等外部 CDN**（大陆访问不稳定）。UI 组件只用 petal-elements（`vendor/petal.js`），不要再手写组件或引入别的组件库。
- `tools/m3-tokens.py` — 从 GitHub androidx/androidx（固定提交）读取 Compose Material 3 的 `tokens/*.kt`，生成 `public/m3/tokens.css`。

## 界面规范：Material 3（数值以 Jetpack Compose Material 3 源码为准）

- 整体必须是 Material Design 3（Expressive）风格。**数值不要凭记忆或看图估**：查 Compose 源码 `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/` 下的 `tokens/*Tokens.kt`（Google 从设计规范生成）和组件的 `*Defaults`（如 `MenuDefaults`、`ButtonGroupDefaults`）。注意 `*Defaults` 有时会覆盖令牌（例如文字按钮的颜色是 Primary，`TextButtonTokens.LabelColor` 是错的，源码里有 TODO），以组件实际用的为准。
- 系统令牌用 `--md-sys-*`（`tokens.css`）：颜色是完整颜色值，直接 `var(--md-sys-color-primary)`；半透明用 `color-mix(in srgb, var(--x) 12%, transparent)`。项目自定义颜色（`--app-color-*`）在 `style.css` 顶部同时定义浅色和深色两套。
- 组件来自 petal-elements，数值已按 Compose 令牌实现；站点只用 `--md-<组件>-*` 令牌调色（见 `style.css`），不要重写组件内部样式。切换按钮底色用公开令牌（`--md-filled-button-unselected-container-color`），不要覆盖私有变量或给组件内部打补丁；petal 的问题记下来反馈，不要在站点里绕。
- 动效：Compose 的弹簧（刚度 / 阻尼比）被采样成 CSS `linear()`，即 `--md-sys-motion-spring-{fast,default,slow}-{spatial,effects}` 及 `-duration`。位置/尺寸/形状用 spatial（有回弹），颜色/透明度用 effects（无回弹）；**跟随指针移动的东西（悬浮提示、光标）用 `--follow`（不回弹）**。JS 里的 Web Animations 用 `app.js` 的 `SPRING_*`（从 CSS 令牌读取），自绘动画用 `springCurve()`。
- 主题：`<html>` 上的 `theme-light|dark|auto`。每次访问都从 `theme-auto`（跟随系统）开始，顶栏开关只有浅色 / 深色两项：跟随系统时显示系统当前的深浅色并随系统变化，用户点选后只在本次访问有效，**不保存**（旧的 `theme-pref` 会被删除）。
- 组件用法（`app.js`）：`bindGroup(el)`（`<petal-button-group connected single-select>`，用 `data-value` 做 `value`，`change` 事件）、`bindRadioMenu(menu)` + `bindMenuButton(button, menu, before)`（`petal-menu` 用 `menuitemradio` / `checked`，菜单用 `positioning="popover"`）、`notify(text, { action, onAction })`（唯一的 `<petal-snackbar>`）、`petal-dialog` 用 `show()` / `close()`（`hidden` 属性可直接用于 petal 组件）；文本框 `label` / `supportingText` / `error` / `errorText` 都是属性；提示用 `<petal-tooltip for="按钮id">`；列表是 `<petal-list segmented>`；小标签是 `petal-assist-chip`。页面仍是窗口滚动：`#scroller`（`petal-pull-to-refresh scroll-target="page"`）包住整页，`--md-pull-to-refresh-top-offset: 64px` 让指示器从顶栏下方出现。

## 页面细节

- **顶部应用栏**：`<petal-top-app-bar size="medium" scroll-target="scroller">`（`AppBarMediumFlexibleTokens`），标题用 `headline` / `collapsed-headline` 两个插槽（带图标，各放一份），`heading-level="1"`，`collapsed-subtitle=""`（折叠行不显示副标题）。折叠比例用 `collapsedFraction` 和 `collapse-change` 事件，完全折叠（≥1）时地址栏颜色切换为 surface-container（`syncThemeColor()`）。
- **「更多」菜单**（`#more-menu`，`initMoreMenu()`）：动作项是普通 `petal-menu-item`，点击在 `click` 里按 `id` 处理；打开前隐藏不适用的项（`bindMenuButton` 的 `before`），空组自动隐藏。主题按钮组保留在顶栏，不要收进菜单。GitHub 按钮（`#github-btn`，GitHub octicon 的 SVG，Material Symbols 没有品牌图标）600dp 起显示在顶栏，更窄时改在菜单里显示 `#more-github`。
- **宽屏布局**（M3 自适应，数值来自 Compose `WindowSizeClass` / `PaneScaffoldDirective`）：600dp 起页边距 24dp；840dp 起分为主区（今日汇率、走势）和辅助区（360dp，1200dp 起 412dp；计算器、常用金额、万事达、安装），间距 24dp，内容最宽 1280px。区块由 `layoutPanes()` 在两栏之间移动（DOM 顺序 = 显示顺序），新增区块时加 `sec-side` 类即可进辅助区。
- **卡片圆角**：页面上所有色块（卡片和常用金额列表的外角）统一为 medium 12dp，即 Compose `FilledCardTokens.ContainerShape`。
- **卡片色块**：每张卡片都是 filled 容器，用 `--card-bg` / `--card-on` 指定：今日汇率 primary-container、计算器自定义青绿色（`--app-color-calc-container`，style.css 顶部浅/深两套）、走势 secondary-container、万事达、常用金额、安装卡片等中性色块统一为 surface-container-highest（`FilledCardTokens.ContainerColor`）。卡片内文字、文本框、图表描边都从这两个变量取色，换色只改这一处。
- **数字**：今日汇率和计算结果都用 `odometer()`（每位数字是 0–9 的滚动列；位数变化时按小数点对齐，同一位从原来的数字滚过去）；计算结果传 `label: false`（朗读和复制用 `#calc-result` 自己的 `.sr-only`），滚动波纹间隔 `--odo-stagger` 20ms。
- **走势图**：首次出现用画线动画（`draw`），之后切换范围/方向/新数据都用 `morph`（旧线变形为新线，不重画）；在屏幕外时动画暂停到可见（`is-waiting`）。
- **区块入场**：`html.js` 下各 section 滚动到可见才播放入场动画。
- **形状**：由 `ExpressiveShapes.polygon(name)` 生成同点数的 `polygon()`，可直接用 clip-path 过渡变形；新形状加在 `radius` 表里。
- **字号**：一律用 M3 字号角色（`--md-sys-typescale-*`，关键数字和标题用 `*-emphasized`），不要再写自定义的字号 / 字重。今日汇率：手机 headline-medium、600dp 起 display-small、1200dp 起 display-medium；计算结果：headline-large（手机与窄栏 headline-medium）。
- **下拉刷新**：`#scroller`（仅触屏、在最顶部时）派发 `refresh`，`pullRefresh()` 完成后设 `refreshing = false`；花瓣颜色用 `--md-pull-to-refresh-*` 改成站点配色。
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
- README 有三种语言：`README.md`（简体中文，主版本）、`README.ja.md`、`README.en.md`，顶部互相链接；改功能列表、更新日志等内容时三份同步更新。

## 多语言（`public/i18n.js`）

- 三种语言：`zh`（默认）、`ja`、`en`。选择顺序：URL `?lang=` → 用户在菜单中的选择（`localStorage` 键 `lang-pref`）→ 设备语言（`zh-*`/`ja-*`）→ 其余一律 `en`。
- **新增或修改任何用户可见文字，三种语言都要写**：静态文字在 `index.html` 用 `data-i18n` / `data-i18n-html`（含链接）/ `data-i18n-attr="attr:key;…"` 标记；`app.js` 里用 `t(key, params)`，数字和时间用 `locale()`。不要在 HTML/JS 里写死中文。
- 切换语言会派发 `langchange` 事件，`app.js` 的 `initLanguage()` 里重绘所有 JS 生成的文字；新增动态文字要在那里加上。
- 每种语言有独立 URL（`/`、`/?lang=ja`、`/?lang=en`），Worker 用 HTMLRewriter 改写 `<head>`（lang、title、description、canonical、og），并按 `data-i18n` / `data-i18n-html` / `data-i18n-attr` 把正文翻译好再返回（词典来自 `i18n-strings.js`）；**否则各语言页的正文都是中文，Google 会判为重复网页、只收录 `/`**。因此 `index.html` 里由 JS 填写的占位文字（骨架屏、金额标签等）不要写中文，用数字或币种代码；`worker.js` 的 `PAGE_META` 要和 `i18n.js` 的 `doc.title` / `doc.description` 保持一致。hreflang 写在 `index.html` 和 `sitemap.xml`。
- 语言菜单：`petal-menu` + `petal-menu-group`（M3 Expressive 分组菜单，选中项 `checked`，`menuitemradio`）。
- 每种语言另有分享预览图 `og-image-{ja,en}.png` 和清单 `manifest-{ja,en}.webmanifest`（`id` 同为 `/`，是同一个 App），Worker 按 `?lang=` 改写，`applyI18n()` 在页面里同步切换。
- 日文页面优先用日文字体（`:root:lang(ja)`），否则汉字会显示成中文字形。
- **提交说明不要加 `Co-Authored-By: Claude …` 之类的署名行**，PR 描述也不要加 Claude Code 署名；README 等文档中也不要把 Claude 列为作者或贡献者。
