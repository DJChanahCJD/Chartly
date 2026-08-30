# Nobel Prize 适配器设计

日期:2026-08-30

## 背景

Chartly 新增第一个非娱乐类奖项:诺贝尔奖。官方提供免 Key 的 API v2.1
(`https://api.nobelprize.org/2.1/nobelPrizes`),数据覆盖 1901 年至今,
无需自建爬虫,只需实时代理 + 清洗为 Chartly 最小 schema。

## 决策

- **路由**:`GET /api/awards/nobel/{year}`,沿用现有 `/api/awards/{source}/{year}` 约定。
- **数据策略**:实时代理官方 API + Cache API 缓存 24 小时(与 grammy 同模式)。
- **字段(最小必要)**:只保留类别名与获奖者名、获奖理由;丢弃 `awardYear`
  (路径已含)、`categoryFullName`、多语言字段、`prizeAmount`、`dateAwarded`、
  `links`、`meta`、`portion`、laureate `id`/`sortOrder`。
- **不提供跨年查询**(`/all` 等):全量 120+ 年响应过大,调用方按年取即可。YAGNI。

## 响应结构

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

不回显 `year` / `url`(均可由路径推导,符合 README 最小必要原则)。

## 清洗规则

- 上游单次请求 `?nobelPrizeYear={year}&limit=100`:每年最多 6 个奖项,单页足够,无需分页。
- 人名取 `knownName.en`,无则回退 `orgName.en`(组织奖,如 2024 和平奖)、再回退 `fullName.en`。
- 无 `laureates` 的类别(未颁奖年份,如 1940-1942 战争期间)整条跳过;
  若该年全部未颁奖,返回 `"categories": []` 而非 404(真实历史事实,不算错误)。
- 类别顺序保持上游返回顺序。

## 路由与错误

- 入口 awards 分支年份校验下限从 1950 放宽到 1901(Nobel 起点);grammy/gma
  适配器内部已有各自越界报错,不受影响。
- `year < 1901` 或 `> 当前年` → 适配器抛 `nobel: no prizes for year X` → 入口映射 404。
- 上游非 2xx / 非 JSON → 502。
