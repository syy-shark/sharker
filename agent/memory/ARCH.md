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
| `schema.ts` | 表结构与迁移（v2：sessions.pinned / unread；v3：sessions.memory_injection / memory_generation 本对话覆盖） |
| `types.ts` | Memory 域类型（scope/kind、检索上下文等） |
| `conversations.ts` | 会话与消息 CRUD；列表带最近用户/助手正文 `preview` 供 Search chats；`loadConversation({ tail })` 只取最近一段并按约 50KiB 预算瘦身（对标 Codex #38653）、`{ slim: true }` 给模型/压缩/分叉取瘦身全文（不灌进 React）、不传 options 则原文给模型/落盘、`loadOlderConversationMessages` 上滑再取一页、`loadConversationMessage` 点开再取完整消息、`searchConversationOccurrences` 只扫用户/助手正文（对标 Codex #33907，不回放整段）、`loadConversationMessageRange` 给 ⌘↑ 头页 / 查找命中揭开有界一段并瘦身；读写 `session_messages.created_at` 给 hover 时间戳（对标 Codex #23849），冲突更新不改首次写入时间；落盘跳过仍是占位的消息、不删其 id，以免空壳盖掉库里的全文；`historyStartSeq` 落盘只改该 seq 起的消息以免删掉未加载的更早页；`patchConversationMeta` 只改标题/置顶/未读/本对话记忆；`loadSessionMemoryPolicy` 读本对话覆盖；旁路/独立窗可 `activate: false` |
| `memories.ts` | 长期记忆 CRUD、hash、embedding 候选 |
| `events.ts` | Agent 执行事件落库 |
| `projects.ts` | 代码项目识别与 upsert（git 根 / package.json） |
| `workspaces-sync.ts` | 与 `AppSettings.workspaces` 同步 PG |
| `embeddings.ts` | OpenAI 兼容 `/v1/embeddings` |
| `retriever.ts` | 精确 + 关键词 + 语义（余弦）检索 |
| `assembler.ts` | 检索结果 → 预算内 prompt block；`memoriesEnabled !== true` 或 `memoryInjection === false` 时跳过 |
| `writer.ts` | Turn 结束自动提炼并写入 memories + events；`memoriesEnabled !== true` 或 `memoryGeneration === false` 时只记事件 |
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
