# 人民币 ⇄ 日元 汇率板

[![汇率板：日元人民币汇率](public/og-image.png)](https://rate.anontokyo.vip)

一个简洁的日元 / 人民币汇率查询网站：每日中间汇率、金额换算、30 天至 1 年的历史走势。

**在线访问：<https://rate.anontokyo.vip>**

![License: MIT](https://img.shields.io/badge/license-MIT-blue) ![Cloudflare Workers](https://img.shields.io/badge/deploy-Cloudflare%20Workers-f38020) ![Material 3](https://img.shields.io/badge/UI-Material%203%20Expressive-6750a4)

## 功能

- **今日汇率**：JPY ⇄ CNY 中间汇率，一键切换兑换方向。
- **换算计算器**：输入金额即时折算；支持简单算式（如 `1980*3`、`(1200+800)/2`，全角字符也可以），手机上输入时会出现 + − × ÷ 按键。
- **日本购物免税**：从日元换算时可选「免税 10%」或「免税 8%（食品饮料）」，自动扣除消费税后再换算。
- **常用金额**：把房租、学费等金额保存在浏览器里，每次打开都按最新汇率算好，点一下即可填入计算器。
- **现在换钱划算吗**：今日汇率卡片显示当前汇率在近一年中的位置（高于百分之多少的日子）。
- **历史走势**：30 天 / 90 天 / 180 天 / 1 年，标出区间最高、最低和涨跌幅；悬停或轻点任意一天可查看当天汇率及与最新值的差距，也支持键盘方向键逐日查看。
- **三种语言**：简体中文、日本語、English，按设备语言自动选择，也可以在顶栏的语言菜单中切换；每种语言有独立网址（`/`、`/?lang=ja`、`/?lang=en`），方便分享和搜索引擎收录。
- **数据一致**：页面上所有数字来自同一数据源，同一天的汇率在各处相同。
- **较前一日涨跌**：今日汇率旁显示与前一个公布日相比的涨跌幅。
- **自动更新**：页面开着时，欧洲央行公布新汇率后会自动刷新，数字以滚动动画变为新值。
- **Material 3 Expressive 风格**：弹簧动效、连接式按钮组、形状变形的加载动画和装饰图形；浅色 / 深色 / 跟随系统三种主题，适配手机；动效遵循系统的「减弱动态效果」设置。
- **可添加到主屏幕**：页面底部有安装卡片（安卓 / 电脑上的 Chrome、Edge 一键安装，iPhone 显示操作说明；安卓上的其他浏览器会提示改用 Chrome 安装）；安装后像 App 一样打开，长按图标可直接进入「人民币换日元」或「日元换人民币」。
- **离线可用**：断网时显示上次获取的数据，并在顶部注明是哪一天的汇率；恢复联网后自动刷新。
- **一键复制换算结果**：点击结果或复制按钮，复制不带千分位的纯数字，方便粘贴到其他 App。
- **分享换算结果**：手机上调出系统分享菜单，其他浏览器复制文字和链接；链接形如 `/?amount=10000&from=JPY`，打开即显示同样的换算。
- **提示下次更新时间**：按访客所在时区显示欧洲央行下次公布汇率的大致时间。
- **国内外都能访问**：界面库和字体全部自托管，不依赖 unpkg、Google Fonts 等在中国大陆不稳定的 CDN。
- 免费、无广告、无跟踪 Cookie。

## 技术栈

- **运行环境**：[Cloudflare Workers](https://developers.cloudflare.com/workers/)（Static Assets 提供前端，`worker.js` 处理 `/api/*`）
- **前端**：原生 HTML / CSS / JavaScript，无构建步骤、无 npm 依赖；走势图为手写 SVG
- **界面**：自己实现的 [Material 3 Expressive](https://m3.material.io) 组件（`public/m3/`），不依赖 UI 库。配色、字号、形状、动效等设计令牌由 `tools/m3-tokens.py` 从 [Jetpack Compose Material 3](https://github.com/androidx/androidx/tree/androidx-main/compose/material3) 源码生成；各组件的尺寸也取自其中的组件令牌

## 项目结构

```text
cny-jpy-rate/
├── worker.js            # Worker 入口：/api/rate、/api/history，其余请求交给静态资源
├── wrangler.toml        # Workers / Assets / 日志配置
├── public/
│   ├── index.html
│   ├── app.js           # 前端逻辑、走势图、动效
│   ├── i18n.js          # 界面文案（中 / 日 / 英）与语言切换
│   ├── style.css
│   ├── m3/
│   │   ├── tokens.css   # M3 系统设计令牌（由 tools/m3-tokens.py 生成）
│   │   ├── m3.css       # M3 组件样式
│   │   └── m3.js        # M3 组件行为（菜单、按钮组、提示、snackbar、涟漪）
│   ├── expressive.js    # M3 形状库（装饰形状、加载指示器）
│   ├── manifest*.webmanifest  # Web App 清单（中文 / -ja / -en，安装后的名称随语言）
│   ├── sw.js            # Service Worker：网络优先，离线时使用缓存
│   ├── icons/           # Web App 图标
│   ├── favicon.svg
│   ├── og-image*.png    # 分享卡片预览图（1200×630，中文 / -ja / -en），源文件 docs/og-image.html
│   ├── robots.txt
│   ├── sitemap.xml
│   └── vendor/fonts/    # 自托管的字体
├── docs/
│   └── og-image.html    # 预览图的源文件（?lang=ja / en 切换语言）
├── tools/
│   └── m3-tokens.py     # 从 Compose Material 3 源码生成 tokens.css
├── CLAUDE.md            # 给 Claude Code 的项目说明
├── LICENSE
└── README.md
```

## 本地开发

需要 [Node.js](https://nodejs.org)：

```bash
npx wrangler dev
```

然后打开 <http://localhost:8787>。接口会实时请求上游数据源，需要能访问外网。

## 部署

仓库已连接 Cloudflare **Workers Builds**：推送到 `main` 分支后自动执行 `npx wrangler deploy`，无需构建命令。

如果要部署自己的副本：Fork 本仓库，在 Cloudflare 控制台的 **Workers & Pages** 中创建 Worker 并连接你的仓库，部署命令填 `npx wrangler deploy` 即可。也可以在本地运行 `npx wrangler deploy` 直接部署。

## API

| 路由 | 说明 | 缓存 |
| --- | --- | --- |
| `GET /api/rate` | 当前中间汇率及前一个公布日，返回 `{ date, cny_to_jpy, jpy_to_cny, prev_date, prev_cny_to_jpy, source }` | 10 分钟 |
| `GET /api/history?days=N` | 日线历史，`N` 为 7～365（默认 90），返回 `{ points: [{ date, rate }], source }` | 1 小时 |

- `rate` 始终为 1 CNY 兑 JPY，前端按兑换方向自行取倒数。
- `source` 为 `frankfurter`（主源）或 `currency-api`（备用源），页面会据此注明。

## 数据源

- **主源**：欧洲央行（ECB）参考汇率，经 [Frankfurter](https://frankfurter.dev) 获取，每个工作日更新一次，周末和节假日沿用上一个工作日的数据。程序会校验返回的基准货币是 CNY，避免参数被忽略时显示错误的数字。
- **备用源**：[currency-api](https://github.com/fawazahmed0/exchange-api)，仅在 Frankfurter 请求失败时使用（jsDelivr 优先，Cloudflare Pages 镜像兜底）。它每次只能查询一天，因此备用模式下的历史走势最多取 20 个采样日，以控制在 Workers 免费版每次请求 50 个子请求的限制内。
- **Mastercard**：官方没有公开接口，官网也有机器人防护，因此本站不自动查询，只提供官方换算器的链接。

以上均为中间价，不含任何银行或支付机构的买卖点差。

## 开发备注

- **设计令牌**：`public/m3/tokens.css` 由脚本生成，不要手改。更新到 Compose 的新版本：

  ```bash
  python tools/m3-tokens.py <androidx 提交 SHA>
  ```

- **静态资源自托管**：`public/vendor/fonts/` 为 Google Sans Flex（可变字体，ASCII 子集）和 Material Symbols Rounded（可变字体，只含用到的图标，新增图标的方法见该目录的 README.txt）；中文、日文使用系统字体。
- **日志**：`wrangler.toml` 中开启了 Workers Logs（`[observability]`）。请不要删除这一项，否则部署会把控制台中开启的日志关闭。
- **预览图**：编辑 `docs/og-image.html` 后，用无头浏览器重新生成三种语言（文件路径需为绝对路径的 `file:///` 网址，才能带上 `?lang=`）：

  ```bash
  msedge --headless --hide-scrollbars --force-device-scale-factor=1 --window-size=1200,630 --screenshot=public/og-image.png "file:///D:/Project/cny-jpy-rate/docs/og-image.html"
  msedge --headless --hide-scrollbars --force-device-scale-factor=1 --window-size=1200,630 --screenshot=public/og-image-ja.png "file:///D:/Project/cny-jpy-rate/docs/og-image.html?lang=ja"
  msedge --headless --hide-scrollbars --force-device-scale-factor=1 --window-size=1200,630 --screenshot=public/og-image-en.png "file:///D:/Project/cny-jpy-rate/docs/og-image.html?lang=en"
  ```

- **搜索引擎**：已在 Google Search Console 验证，sitemap 为 `/sitemap.xml`。页面 `<head>` 中的 description、canonical、Open Graph 与 JSON-LD 都直接写在 HTML 里，不依赖 JS。

## 更新日志

### 2026-10-06：常用金额、免税换算与算式输入

- 新增「常用金额」：保存房租、学费等金额（只存在本机浏览器），每次打开都按最新汇率算好；点一下填入计算器，可编辑、删除（可撤销）。
- 新增「现在换钱划算吗」：今日汇率卡片显示当前汇率高于近一年百分之多少的日子。
- 新增日本购物免税换算（10% / 8%）。
- 金额支持简单算式，手机上输入时显示运算符按键。
- 安装到桌面后，长按图标可直接进入两个换算方向。
- 安卓上用 Chrome 以外的浏览器时，安装卡片提示改用 Chrome，避免「为旧版 Android 设计」的系统警告。

### 2026-10-06：按 Compose Material 3 源码重做界面

- 移除 mdui，全部组件改为自己实现（`public/m3/`），设计规范完全以 Jetpack Compose Material 3 的源码为准。
- 配色、字号、形状、状态层和动效令牌由脚本从 Compose 源码生成；动效直接使用 Compose 的弹簧参数（刚度、阻尼比），转换为 CSS `linear()` 曲线。
- 按钮按下时变形为小圆角；连接式按钮组按下的按钮会变宽 15%，并挤压相邻按钮；文本框、菜单、提示、snackbar、顶部应用栏均按 Compose 的组件令牌实现。
- 图标改为 Material Symbols Rounded（可变字体，选中状态的图标会填充），只保留用到的图标，图标字体从 128 KB 减到 14 KB。
- 页面不再加载约 380 KB 的组件库脚本和样式。

### 2026-10-06：多语言

- 新增日本語和 English 界面，按设备语言自动选择（中文设备显示中文、日文设备显示日文，其余显示英文）。
- 顶栏新增语言菜单，按 M3 Expressive 菜单规格制作（分组色块、大圆角、选中项填色并变形，数值取自 Jetpack Compose Material 3），可选「跟随设备语言」，选择会被记住。
- 每种语言有独立网址，搜索引擎可分别收录；页面标题、描述、分享卡片的文字和预览图、安装后的 App 名称都随语言变化。
- 分享换算结果的链接带上当前语言，对方打开时与分享文字一致。
- 日期、时间、星期和数字按各语言习惯显示；日文页面使用日文字体。
- 手机上主题切换按钮改为图标，为语言按钮腾出空间。
- 换算结果的复制、分享按钮固定在行尾，数字滚动时不再跟着抖动。

### 2026-10-06：Material 3 Expressive 改版

**界面**
- 按 [M3 Expressive](https://m3.material.io) 规范改版：弹簧动效（使用官方给出的 Web 曲线）、连接式按钮组、波浪形进度条、形状变形的加载指示器、缓慢旋转并会变形的装饰形状。
- 所有卡片改为 M3 大色块：今日汇率为主色容器，计算器为自定义青绿色，走势图为第二色容器，万事达为中性色；圆角分层级（主卡片更大）。
- 字体统一为 Google Sans Flex（可变字体，圆润轴，等宽数字），移除 Roboto 与 IBM Plex Mono，页面只加载两个字体文件。
- 大标题改为「JPY ⇄ CNY」，去掉英文小标题；万事达说明改为面向用户的简短说明。

**动效**
- 汇率数字以里程表方式逐位滚动；切换兑换方向时两种货币互换位置，装饰形状随之变形。
- 走势图首次出现时从左到右画出；切换时间范围、方向或有新数据时，旧曲线直接变形为新曲线。
- 各区块滚动到可见时才播放入场动画；走势图最新数据点有呼吸光圈；悬浮提示平滑跟随指针。
- 加载指示器先退场再显示数据；缓存命中的切换不再闪现进度条。
- 主题切换时，新主题从点击处圆形扩散。
- 所有装饰性动画都遵循系统的「减弱动态效果」设置。

**功能**
- 今日汇率显示「较前一日」涨跌，以及欧洲央行下次公布汇率的大致时间（按访客所在时区）。
- 页面开着时，欧洲央行公布新汇率后自动刷新。
- 一键复制换算结果；分享换算结果（系统分享菜单，或复制文字与链接，链接打开即还原金额与方向）。
- 可添加到主屏幕（Web App），离线时显示上次的数据并注明日期，恢复联网后自动刷新。

**修复与改进**
- 今日汇率接口缓存缩短为 10 分钟、历史走势为 1 小时；走势图落后时自动补上当天的点，与今日汇率保持一致。
- 1 年走势的横轴改为显示年月，避免跨年日期重复。
- 读屏软件可以正确读出汇率与换算结果；选中复制汇率时不再混入动画用的数字。

## 许可证

本项目代码以 [MIT License](LICENSE) 发布。

`public/vendor/` 中的第三方文件沿用各自的许可证：Google Sans Flex 为 SIL Open Font License 1.1，Material Symbols 为 Apache License 2.0（见 `public/vendor/fonts/README.txt`）。汇率数据的版权和使用条款归各数据提供方所有。

## 作者

- Saki（[@Saki340](https://github.com/Saki340)）

## 特别感谢

本项目建立在以下开放的数据、工具和设计资源之上，谨此致谢：

- [欧洲中央银行（ECB）](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html)：公开发布每日欧元参考汇率，是本站汇率数据的最终来源。
- [Frankfurter](https://frankfurter.dev)（[lineofflight/frankfurter](https://github.com/lineofflight/frankfurter)，MIT）：把欧洲央行参考汇率整理成免费、开源、无需密钥的 API。
- [currency-api / exchange-api](https://github.com/fawazahmed0/exchange-api)（fawazahmed0，CC0 1.0）：免费的汇率数据，作为本站的备用数据源。
- [Jetpack Compose Material 3](https://github.com/androidx/androidx/tree/androidx-main/compose/material3)（Apache License 2.0）：本站的设计令牌和组件尺寸取自其源码。
- [mdui](https://www.mdui.org)（[zdhxiong/mdui](https://github.com/zdhxiong/mdui)，MIT）：本站 2026-10 之前的界面组件库。
- [Material Design 3 / M3 Expressive](https://m3.material.io)（Google）：本站遵循的设计规范，包括配色、弹簧动效、按钮组、进度指示器与形状库。
- [Google Sans Flex](https://fonts.google.com/specimen/Google+Sans+Flex)、[Material Symbols](https://fonts.google.com/icons)：页面使用的字体和图标。
- [Cloudflare Workers](https://workers.cloudflare.com)：本站的托管与部署平台。
- [jsDelivr](https://www.jsdelivr.com)、[shields.io](https://shields.io)：备用数据的 CDN 和本文档中的徽章。

## 免责声明

本项目仅提供汇率查询与换算参考功能，不构成任何金融、投资或法律建议，也不对使用本站数据造成的任何损失承担责任；具体交易请以银行、支付机构或万事达官方渠道公布的汇率为准。
