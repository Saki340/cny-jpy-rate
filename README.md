# 人民币 ⇄ 日元 汇率板（Cloudflare Workers Builds）

静态前端由 Cloudflare Workers Static Assets 提供，`worker.js` 统一处理 `/api/*` 接口，适用于 Cloudflare Workers Builds（Git 集成构建部署）。

## 项目结构

```text
cny-jpy-rate/
├── worker.js           # Worker 入口，处理三个 API 并回退到静态资源
├── wrangler.toml       # Workers / Assets 配置
├── public/
│   ├── index.html
│   ├── app.js
│   └── style.css
└── README.md
```

## 使用 Workers Builds 部署

1. 将本目录内容提交到 GitHub 仓库。
2. 在 Cloudflare Dashboard 的 **Workers & Pages** 中创建/选择 Worker，并连接该 Git 仓库，使用 **Workers Builds**。
3. 构建配置使用仓库根目录 `.`；本项目无需构建命令，部署命令使用：

   ```bash
   npx wrangler deploy
   ```

   `wrangler.toml` 已指定 `worker.js` 为入口，并将 `public/` 配置为静态资源目录。若控制台提供构建命令和部署命令输入框，构建命令可留空，部署命令填 `npx wrangler deploy`。
4. 部署后测试 `/api/rate`、`/api/history?days=90` 和 `/api/mastercard?direction=cny2jpy&amount=100`。

本地预览（需 Node.js）：

```bash
npx wrangler dev
```

## API 路由

- `GET /api/rate`：当前 CNY/JPY 汇率，主源失败时使用镜像源。
- `GET /api/history?days=90`：历史走势（CNY→JPY 日线），最多 365 天；返回 `{ points: [{ date, rate }] }`。
- `GET /api/mastercard?direction=cny2jpy|jpy2cny`：尝试读取 Mastercard 官网换算器使用的内部接口，成功返回 `{ ok: true, rate, fx_date }`，失败返回 `{ ok: false, reason, status }`（`blocked` / `http` / `unexpected` / `network`）。

## 数据源与缓存

- 当前汇率：[currency-api](https://github.com/fawazahmed0/exchange-api) 主源及镜像，响应缓存 1 小时。
- 历史走势：[Frankfurter](https://frankfurter.dev)（欧洲央行参考汇率，`api.frankfurter.dev/v1`），响应缓存 6 小时；会校验返回的基准货币是 CNY，避免参数被忽略时画出错误曲线。走势图是纯 SVG 绘制，前端没有任何第三方库依赖。
- Mastercard：官网换算器的内部接口，仅尽力获取。该站点启用了 Akamai 机器人防护，来自服务器的请求可能被拒绝（HTTP 403），此时页面会显示原因并提供官方换算器链接；请求成功时页面会显示 `1 JPY = x CNY`、按当前金额折算的结果和相对中间价的差异。

Workers Builds 部署的是 Worker，不再使用 Pages 专属的 `functions/` 自动路由目录。

## 界面

样式基于 [hiratazx/material-you-css](https://github.com/hiratazx/material-you-css)（Material You / Material Design 3 的 CSS 实现，MIT License）。仓库里 `public/vendor/material-you.css` 是本地保存的一份，只保留了本站用到的组件（排版、按钮、卡片、tabs、switch、文本框、顶部应用栏、阴影、工具类），并非原仓库的完整文件；许可证原文见同目录下的 `material-you-css-LICENSE.txt`。primary/secondary 配色手工改成了人民币红／日元蓝，不是用官方 Material Theme Builder 生成的。"Material Design"／"Material You" 是 Google LLC 的商标，本项目及上游库均与 Google 无关联。

## 免责声明

本项目仅提供汇率查询与换算参考功能，不构成任何金融、投资或法律建议，也不对使用本站数据造成的任何损失承担责任；具体交易请以银行、支付机构或万事达官方渠道公布的汇率为准。
