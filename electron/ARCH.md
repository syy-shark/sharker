# electron — 主进程与持久化

## 职责

- 应用入口、窗口、**全部 IPC handler**
- 设置读写（含 API Key 加密）、对话落盘委托
- 调用 `executeUserInput`（Turn 管线），转发流式 chunk 到渲染进程
- **不管**：React UI、工具业务实现细节（在 `tools/` / `agent/`）

## 同级目录

| 目录 | 说明 |
|------|------|
| [main/](./main/ARCH.md) | 主进程入口、IPC、自动化调度、PTY 终端 |
| [preload/](./preload/ARCH.md) | `contextBridge` → `window.sharker` |

## 同级文件

| 文件 | 说明 |
|------|------|
| `settings-store.ts` | `settings.json` + `safeStorage` 加密 API Key |
| `conversations-store.ts` | 对话 CRUD 门面，委托 `agent/memory/conversations` |
| `ARCH.md` | 本层架构说明 |

## 关键 IPC

完整列表见 `shared/ipc.ts`。常用：

| Channel | 作用 |
|---------|------|
| `chat:send` / `chat:abort` | 跑 / 中止 Turn |
| `settings:*` | 读写设置 |
| `conversations:*` | 对话 CRUD |
| `approval:response` | 高危操作确认 |
| `git:review-action` | 审查面板暂存 / 取消暂存 / 还原 |
| `git:hunk-action` | 审查面板单个 hunk 暂存 / 取消暂存 / 还原 |
| `git:commit` / `git:push` | 审查面板提交已暂存 / 推送当前分支 |
| `git:branch-changes` | 相对基线分支的已提交变更 |
| `git:create-pr` | 审查面板用 `gh pr create` 开 PR |
| `git:create-branch` | 隔离 worktree 在 HEAD 上创建命名分支 |
| `automations:queue-*` | 自动化审查队列读写 |
| `workspace:search-files` | Composer `@` 工作区文件搜索 |

## 数据流

`chat:send` → `executeUserInput` → … → `queryLoop` → `event.sender.send('chat:stream')`

## 扩展点

- 新 IPC：main 注册 + preload 暴露 + `src/vite-env.d.ts`
- 新持久化：优先 `electron/*-store.ts`，格式写入 [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)

## 依赖

- `agent/`、`providers/`、`tools/`、`shared/`
