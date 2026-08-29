# tools/builtins/web — 网络抓取与搜索

## 职责

- `web_fetch` / `web_search`，受 `network-policy` 约束

## 同级目录

（无子目录）

## 同级文件

| 文件 | 说明 |
|------|------|
| `index.ts` | web_fetch / web_search；搜索直播用官方 Searching / Searched，来源结构化（对标 Codex #9960 / #24693 / #32898），不发明 find_in_page / web.run |
| `web-search.test.ts` | Instant Answer → title/url 来源 |
| `ARCH.md` | 本层架构说明 |
