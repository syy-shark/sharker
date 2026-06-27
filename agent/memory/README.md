# agent/memory — PostgreSQL 记忆系统

嵌入式 **PGlite**（`~/.sharker/memory-db`），会话与长期记忆的唯一数据源。

## 四段架构

| 模块 | 文件 | 职责 |
|------|------|------|
| Writer | `writer.ts` | Turn 结束自动提炼并写入 `memories` + `events` |
| Store | `db.ts`, `schema.ts`, `conversations.ts`, `memories.ts`, … | PG CRUD |
| Retriever | `retriever.ts` | 精确 / 关键词 / 语义（embedding 余弦） |
| Assembler | `assembler.ts` | 预算内组装 prompt block |

## 表

- `projects` / `workspaces` — 代码项目与工作区（与 `AppSettings.workspaces` 同步）
- `sessions` / `session_messages` — 对话（替代 `.sharker/conversations/*.json`）
- `memories` — 长期记忆
- `events` — Agent 执行事件
- `code_snippets` — 代码片段（schema 已建，Writer 后续扩展）

## 接入点

- 启动：`initMemorySystem(homeDir, settings)`（`electron/main/index.ts`）
- 每轮查询：`agent/pipeline.ts` → `assembleMemoryContext`
- Turn 完成：`writeMemoriesFromTurn`（异步，不阻塞 UI）

## 依赖

- `@electric-sql/pglite`
- Embedding：`/v1/embeddings`（OpenAI 兼容；失败时降级为关键词检索）
