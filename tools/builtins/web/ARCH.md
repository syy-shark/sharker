# tools/builtins/web — 网络抓取与搜索

## 职责

- `web_fetch` / `web_search`，受 `network-policy` 约束

## 同级目录

（无子目录）

## 同级文件

| 文件 | 说明 |
|------|------|
| `index.ts` | web_fetch / web_search；直播都用官方 Searching the web / Searched（fetch 的 URL 走 detail，对标 open_page / #9960 / #7390），搜索来源结构化。不发明 Fetched / find_in_page / web.run |
| `web-search.test.ts` | Instant Answer → title/url 来源 |
| `ARCH.md` | 本层架构说明 |
