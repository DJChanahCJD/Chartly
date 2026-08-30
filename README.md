# Chartly

免费公开的音乐榜单 & 奖项 API。完全开放，无需 API Key。部署在 Cloudflare Pages。

## 端点

| 端点 | 说明 |
| --- | --- |
| `GET /api` | 端点索引 |
| `GET /api/charts/billboard/hot-100` | Hot 100 |
| `GET /api/charts/billboard/album-200` | Billboard 200（专辑榜） |
| `GET /api/charts/billboard/global-200` | Global 200 |
| `GET /api/charts/billboard/artist-100` | Artist 100（歌手榜） |
| `GET /api/awards/grammy/{year}` | 格莱美获奖名单 |
| `GET /api/awards/gma/{year}` | 金曲奖（静态数据） |
| `GET /api/awards/nobel/{year}` | 诺贝尔奖获奖名单 |
| `GET /api/awards/oscars/{year}` | 奥斯卡获奖与提名名单 |

榜单响应：

```json
{
  "date": "2026-08-29",
  "url": "https://www.billboard.com/charts/billboard-200/",
  "entries": [
    { "rank": 1, "title": "...", "artist": "...",
      "cover": "...", "lastWeek": 2, "peak": 1, "weeks": 10 }
  ]
}
```

歌手榜（`artist-100`）的条目没有 `title` 字段，`artist` 即歌手名。`date` 是归一化后的榜单周六（可能与请求的 `?date` 不同），`url` 是数据来源的官网页面。

最小必要原则：响应不回显路径中已包含的 `source` / `chart` / `type`，只返回调用者无法自行推导的字段。

奖项响应：

```json
{
  "url": "https://www.grammy.com/awards/68th-annual-grammy-awards-2025/",
  "categories": [
    {
      "name": "Record Of The Year",
      "winner": "Kendrick Lamar , SZA",
      "title": "luther",
      "nominees": ["luther — Kendrick Lamar , SZA", "..."]
    }
  ]
}
```

- `year` 为**颁奖年份**（第 N 届 = N + 1958；第 60 届起官网 slug 用前一年，adapter 自动处理）。响应不回显请求参数，只返回 `url`（官网仪式页）与 `categories`。
- `winner` / `title` 来自页面完整 Winners 表格，覆盖该届**全部奖项**（约 85–95 个分类）。
- `nominees` 仅官网在仪式页渲染了提名卡片的头部奖项（Record/Album/Song of the Year、Best New Artist 等）才有内容，其余为空数组。

Nobel 响应：

```json
{
  "categories": [
    {
      "name": "Physics",
      "laureates": [
        { "name": "John Clarke", "motivation": "for the discovery of macroscopic quantum mechanical tunnelling and energy quantisation in an electric circuit" }
      ]
    }
  ]
}
```

- `year` 为**颁奖年份**（`awardYear`），范围 1901 至当前年。响应不回显请求参数，只返回 `categories`。
- 数据来自官方 API v2.1（`api.nobelprize.org`）实时代理，人名取 `knownName`（组织奖回退 `orgName`，如 2024 和平奖）。
- 未颁奖的类别（如 1940-1942 战争期间）会被剔除；某年全部未颁奖时返回 `"categories": []` 而非 404。

Oscars 响应（固定 Schema，获奖人归一为逗号分隔的人名列表）：

```json
{
  "year": 2026,
  "awards": [
    {
      "name": "Actor in a Leading Role",
      "winner": { "name": "Michael B. Jordan", "work": "Sinners" },
      "nominees": [
        { "name": "Timothée Chalamet", "work": "Marty Supreme" },
        { "name": "Leonardo DiCaprio", "work": "One Battle after Another" }
      ]
    }
  ]
}
```

- `year` 为**颁奖年份**（典礼页 URL 中的年份），范围 1929（第 1 届）至当前年，每届一个页面。
- 获奖与提名**全部类别**都解析自官网仪式页（`oscars.org/oscars/ceremonies/{year}`）。多人获奖合并为逗号分隔的 `name`；同一人因多部影片得奖时 `work` 以 ` / ` 连接（如 1969 年最佳女主角双黄蛋）。
- `Music (Original Song)` 的 `work` 为官网标注的作品（各年份的歌曲名/影片名不一致，按页面原样返回）。
- 官网位于 Akamai 防护后，adapter 以完整浏览器头请求；上游改版或被拦截时该源暂时 502。

错误统一为 `{ "error": { "status": 404, "message": "..." } }`。

## 历史查询

Billboard 端点支持 `?date=YYYY-MM-DD` 查询历史榜单，日期自动归一到该日期所在周的周六（Billboard 榜单按周六标注）：

```text
GET /api/charts/billboard/hot-100?date=2026-08-15
GET /api/charts/billboard/album-200?date=2020-06-01
```

## 限流与缓存

- 限流：每 IP 60 请求/分钟，超限返回 `429` + `Retry-After`（isolate 内存实现，跨实例为近似计数）。
- 缓存：Cloudflare Cache API，榜单 1 小时、奖项 24 小时，响应带 `X-Cache: HIT/MISS`。
- CORS：全开放（`*`）。

## 本地开发

```bash
npm install
npm run dev        # http://localhost:8788
```

浏览器打开 `http://localhost:8788` 即是 API 调试页。

## 部署

```bash
npm run deploy     # wrangler pages deploy
```

## 结构

```text
functions/
├── _lib/                  # 下划线前缀：不作为路由，仅供导入
│   ├── adapters/          # billboard / grammy / gma / nobel / oscars
│   ├── cache.ts
│   ├── cors.ts
│   ├── ratelimit.ts
│   └── response.ts
└── api/[[path]].ts        # 唯一 API 入口
```

新增数据源只需在 `_lib/adapters/` 加一个文件，并在入口注册。

## 说明

- Billboard / Grammy 为实时抓取上游页面，上游改版会导致该源暂时 502。
- Nobel 为官方 API 实时代理，数据随 NobelPrize.org 更新（当年奖项于 10 月起陆续公布，公布前查询该年返回空列表）。
- Grammy 年份按官网资格年（eligibility year）命名，请求较新年份会自动回退到最近一届，响应中的 `year` 为实际届次年份。
- GMA（金曲奖）目前为内置静态种子数据，后续按年补充或接入真实抓取。

## TODO

- 引入 Hono 作为路由框架