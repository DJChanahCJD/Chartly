# The Game Awards 适配器设计

日期:2026-08-30

## 背景

Chartly 新增 The Game Awards(TGA)奖项。TGA 无公开 API,官网
(thegameawards.com)为 Next.js 站点,数据以 RSC payload 内嵌在 HTML 中。
仅返回各届 winner,不返回 nominees(用户决策:所有年份一律只出 winner)。

## 上游调研结论

- **当前届数据**:`GET /nominees/{slug}`(任意 slug,固定用
  `game-of-the-year`)的 RSC payload 含 `allAwards` 数组,一次性包含全部
  ~30 个类别的 `name`、`winner`(Nominee 对象数组,`title` 字段带
  `[CATEGORY] ` 前缀)。**单请求即可拿全年数据**,无需爬 `/categories`
  发现 slug 再逐页抓取。
- **历史届数据**:`GET /rewind/year-{N}`(N = 2014 至当前届-1)为 SSR
  渲染的结构化 HTML,每个 winner 卡片:`<h2>` 类别名(小写)、`<h3>`
  获奖者、`<h4>` 工作室。**只有 winner,无 nominees**。
- rewind 覆盖 2014 至上一届;最新一届(如 2025)暂未归档,只能从
  nominees 页取。`/rewind/year-2013`、`/rewind/year-2025` 均返回 Error 页
  (HTTP 200,标题 `Error | Rewind`),以此判定归档有效性。
- nominees 页**不含届次年份字段**,且 `?year=` 参数无效,只反映当前届;
  因此年份路由需借助 rewind 归档状态推断。

## 决策

- **路由**:`GET /api/awards/tga/{year}`,入参用年份(与其他 awards 源
  一致),响应返回届数 `edition = year - 2013`(2014 = 第 1 届)。
- **只返回 winner**:所有年份 `awards` 仅含 `name` + `winner`,不出
  nominees(YAGNI,且 rewind 上游本就没有)。
- **缓存 7 天**(604800s):TGA 结果几乎不再变化。
- **类别名归一化**:rewind 类别名小写("game of the year")统一 Title
  Case 对齐当前届命名;winner 文本保留上游原文(trim,大小写不动,
  避免破坏 "II"、"PC" 等缩写)。

## 响应结构

```json
{
  "edition": 12,
  "awards": [
    { "name": "Game of the Year", "winner": "Clair Obscur: Expedition 33" },
    { "name": "Best Performance", "winner": "Jennifer English" }
  ]
}
```

不回显 `year`(可由 edition 推导)。winner 为字符串:游戏类是游戏名,
个人类(Performance / Score and Music / Content Creator / Esports
Athlete)是人名,与上游展示一致。类别顺序保持上游顺序。

## 年份路由

由于 nominees 页无年份信息、rewind 滞后一届归档:

1. `year < 2014` 或 `year > 当前年` → 404。
2. 请求 `GET /rewind/year-{year}`:若为有效归档页(含 winner 卡片)→
   解析返回。
3. 若为 Error 页:探测 `latestArchived`(从 `year - 1` 向下探测
   rewind 有效性,找到即停);若 `year == latestArchived + 1`(即
   year 是当前届)→ 抓 nominees 页解析;否则 404。此策略下探测失败
   倾向 404 而非返回错误届次的数据。
4. `latestArchived` 探测结果按 isolate 内存缓存(7 天过期),避免每次
   请求重复探测;探测最多向下 5 次。

已知瞬态边界:若 rewind 某年落后归档超过一届,该年会被误判为"当前届"
之外而 404(宁可 404 不给错数据),待上游归档后自愈。

## 解析细节

- **nominees 页**:从 `<script>` 中 `allAwards` 的 RSC payload 提取;
  winner 取 `winner[0].title`,去掉行首 `[...] ` 前缀并 trim;
  `votingIsClosed: false` / winner 为空时(12 月颁奖前)该项
  `winner: null`。每个 award 取 `name` 字段(已是 Title Case)。
- **rewind 页**:匹配 winner 卡片 `<article>` 内 `h2/h3/h4`;h2 Title
  Case 后作为 name,h3 作为 winner;跳过无 h2/h3 的卡片。
- 解析失败(无 allAwards / 无 winner 卡片)抛 `tga: ...` 错误 → 入口
  映射 404;上游非 2xx → 502。

## 路由与错误

- 入口 `[[path]].ts`:awards 分支加 `tga`,catch 的 404 前缀判断加
  `tga:`,endpoints 列表加 `/api/awards/tga/{year} (2014+)`。
