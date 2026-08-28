# agent/memory — PostgreSQL 记忆系统

## 职责

- 嵌入式 **PGlite**（`~/.sharker/memory-db`）作为会话与长期记忆的唯一数据源
- Writer / Store / Retriever / Assembler 四段：写入、CRUD、检索、装入 prompt
- 启动时在后台初始化，不阻塞桌面窗口创建

## 同级目录

（无子目录）

## 同级文件

| 文件 | 说明 |
|------|------|
| `init.ts` | 应用启动：`initMemorySystem`（开库 + 同步 workspaces） |
| `db.ts` | PGlite 单例连接与数据目录 |
| `schema.ts` | 表结构与迁移（v2：sessions.pinned / unread） |
| `types.ts` | Memory 域类型（scope/kind、检索上下文等） |
| `conversations.ts` | 会话与消息 CRUD；`patchConversationMeta` 只改标题/置顶/未读；旁路/独立窗可 `activate: false` |
| `memories.ts` | 长期记忆 CRUD、hash、embedding 候选 |
| `events.ts` | Agent 执行事件落库 |
| `projects.ts` | 代码项目识别与 upsert（git 根 / package.json） |
| `workspaces-sync.ts` | 与 `AppSettings.workspaces` 同步 PG |
| `embeddings.ts` | OpenAI 兼容 `/v1/embeddings` |
| `retriever.ts` | 精确 + 关键词 + 语义（余弦）检索 |
| `assembler.ts` | 检索结果 → 预算内 prompt block；`memoryInjection === false` 时跳过 |
| `writer.ts` | Turn 结束自动提炼并写入 memories + events；`memoryGeneration === false` 时只记事件 |
| `ARCH.md` | 本层架构说明 |

## 四段架构

| 角色 | 文件 | 职责 |
|------|------|------|
| Writer | `writer.ts` | Turn 结束写入记忆与事件 |
| Store | `db.ts` / `schema.ts` / `conversations.ts` / `memories.ts` 等 | PG CRUD |
| Retriever | `retriever.ts` | 多路检索 |
| Assembler | `assembler.ts` | 组装 prompt 片段 |

## 接入点

- 启动：`initMemorySystem`（`electron/main/index.ts`）
- 每轮查询：`agent/pipeline.ts` → `assembleMemoryContext`
- Turn 完成：`writeMemoriesFromTurn`（异步，不阻塞 UI）

## 依赖

- `@electric-sql/pglite`
- Embedding：`/v1/embeddings`（失败时降级关键词检索）
