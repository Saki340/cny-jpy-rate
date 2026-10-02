# 人民币 ⇄ 日元 汇率板

在线访问：<https://rate.anontokyo.vip>

查看 JPY / CNY 每日中间汇率、做金额换算、看 30 天至 1 年的历史走势。界面基于 [mdui 2](https://www.mdui.org/zh-cn/docs/2/)（Material Design 3 Web Components），支持浅色 / 深色 / 跟随系统三种主题。

由 Cloudflare Workers 部署：静态前端由 Workers Static Assets 提供，`worker.js` 统一处理 `/api/*` 接口。无构建步骤，无 npm 依赖。

## 项目结构

```text
cny-jpy-rate/
├── worker.js            # Worker 入口：/api/rate、/api/history，其余请求交给静态资源
├── wrangler.toml        # Workers / Assets 配置
├── public/
│   ├── index.html
│   ├── app.js           # 原生 JS，走势图为手写 SVG
│   ├── style.css
│   ├── favicon.svg
│   ├── og-image.png     # 分享卡片预览图（1200×630），源文件 docs/og-image.html
│   ├── robots.txt       # 允许抓取（含 /api/*，Googlebot 渲染页面要用）
│   ├── sitemap.xml
│   └── vendor/          # 自托管的 mdui 与字体（见下文）
├── docs/
│   ├── llms-full.txt    # mdui 2 官方完整文档，开发参考，不部署
│   └── og-image.html    # og-image.png 的源文件
├── CLAUDE.md            # 给 Claude Code 的项目说明
└── README.md
```

## 部署（Workers Builds）

仓库已连接 Cloudflare **Workers Builds**：推送到 `main` 分支后自动执行 `npx wrangler deploy`。构建命令留空，根目录为 `.`。`wrangler.toml` 指定 `worker.js` 为入口，`public/` 为静态资源目录。

本地预览（需 Node.js）：

```bash
npx wrangler dev
```

## API 路由

- `GET /api/rate`：当前 CNY/JPY 中间汇率，返回 `{ date, cny_to_jpy, jpy_to_cny, source }`；缓存 30 分钟。
- `GET /api/history?days=N`（7～365，默认 90）：日线，返回 `{ points: [{ date: YYYY-MM-DD, rate }], source }`；缓存 6 小时。`rate` 始终为 1 CNY 兑 JPY，前端按兑换方向自行取倒数。

`source` 为 `frankfurter` 或 `currency-api`（备用源），前端据此在页面上注明。

## 数据源

今日汇率、换算计算器和历史走势**共用同一个数据源**，保证同一天的数字在页面各处一致：

- 主源：欧洲央行（ECB）参考汇率，经 [Frankfurter](https://frankfurter.dev)（`api.frankfurter.dev/v1`，旧域名 `api.frankfurter.app` 作第二次尝试）。每个工作日更新一次。会校验返回的基准货币是 CNY，避免参数被忽略时显示错误的数字。
- 备用源：[currency-api](https://github.com/fawazahmed0/exchange-api)（jsDelivr，Cloudflare Pages 镜像作第二次尝试），仅在 Frankfurter 失败时使用。它每次只能查一天，所以历史走势在备用模式下最多取 20 个采样日，以控制在 Workers 免费版每次请求 50 个子请求的限制内。
- 曾经使用的 Yahoo Finance 分时数据，因使用条款不允许在公开网站上展示，已移除。
- Mastercard：官方没有公开接口，官网又有机器人防护，因此不自动查询，页面只提供官方换算器链接。

以上都是中间价，不含任何机构的买卖点差。

## 搜索引擎

站点已在 Google Search Console 验证，sitemap 为 `/sitemap.xml`。页面 `<head>` 里有 description、canonical、Open Graph 和 JSON-LD（`WebApplication`），这些都直接写在 HTML 里，不依赖 JS。

修改预览图：编辑 `docs/og-image.html`，然后用无头浏览器重新生成：

```bash
msedge --headless --hide-scrollbars --force-device-scale-factor=1 --window-size=1200,630 --screenshot=public/og-image.png docs/og-image.html
```

## 静态资源自托管

页面要同时服务中国大陆和日本（以及其他地区）的访客。unpkg、Google Fonts 在大陆访问慢或者打不开，所以 mdui 和字体都放在 `public/vendor/`，由 Cloudflare 与页面同源提供：

- `vendor/mdui/`：mdui 2.1.5 的 `mdui.css` 与 `mdui.global.js`（MIT）。升级方法：`npm pack mdui@2`，解压后替换这两个文件。
- `vendor/fonts/`：Roboto、IBM Plex Mono（拉丁子集）和 Material Icons，来源与许可见该目录下的 `README.txt`。中文使用系统字体。

## 作者

- Saki（[@Saki340](https://github.com/Saki340)）
- [Claude](https://claude.com/claude-code)（Anthropic）：参与开发与维护

## 免责声明

本项目仅提供汇率查询与换算参考功能，不构成任何金融、投资或法律建议，也不对使用本站数据造成的任何损失承担责任；具体交易请以银行、支付机构或万事达官方渠道公布的汇率为准。
