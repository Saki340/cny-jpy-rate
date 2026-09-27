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
- `GET /api/history?days=90`：历史走势，最多 365 天。
- `GET /api/mastercard?direction=cny2jpy&amount=100`：尝试获取 Mastercard 参考汇率。该接口为官网页面使用的未公开接口，可能随时失效。

## 数据源与缓存

- 当前汇率：currency-api 主源及镜像，响应缓存建议 1 小时。
- 历史走势：Frankfurter（欧洲央行参考汇率），响应缓存建议 6 小时。
- Mastercard：非公开接口，仅尽力获取。

Workers Builds 部署的是 Worker，不再使用 Pages 专属的 `functions/` 自动路由目录。
