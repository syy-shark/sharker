# tools/builtins/tasks — 后台任务工具

## 职责

- 列出、查看、停止后台任务（shell / 子 Agent 等）
- 对话里创建 / 更新桌面定时任务（对标 Codex Scheduled）

## 同级目录

（无子目录）

## 同级文件

| 文件 | 说明 |
|------|------|
| `index.ts` | 任务相关 ToolHandler 组 |
| `scheduled.ts` | `manage_scheduled_task`：创建 / 改 / 列 / 暂停定时任务（含目标、环境、可选模型 / 思考档位） |
| `ARCH.md` | 本层架构说明 |

## 依赖

- `tools/services/task-manager.ts`
