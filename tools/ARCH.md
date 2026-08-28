# tools — 看 · 搜 · 改 · 跑

## 职责

- **执行** 模型发起的全部 tool calls
- **权限**：工作区沙箱、路径检查、高危命令识别
- **输出卫生**：过长结果截断，避免撑爆上下文
- **不管**：Turn 调度与 system prompt（在 `agent/`）、UI（在 `src/`）

参考 Claude Code 的 Tool 系统：每个 Tool 自包含 Schema + 执行 + 权限钩子，由注册表统一汇总。

## 同级目录

| 目录 | 说明 |
|------|------|
| [builtins/](./builtins/ARCH.md) | 各内置 Tool 实现（一工具一文件或按域分子目录） |
| [services/](./services/ARCH.md) | MCP、任务、Browser host、LSP 等长驻服务 |
| [shared/](./shared/ARCH.md) | 跨工具复用：glob/grep/git-runner/卸载辅助等 |

## 同级文件

| 文件 | 说明 |
|------|------|
| `types.ts` | `SharkerTool` / `ToolHandler` / OpenAI schema 类型契约 |
| `schemas.ts` | 全部 Tool 的 OpenAI JSON Schema（纯数据，渲染进程可 import） |
| `schemas-extended.ts` | Phase 2+ 扩展 schema，由 schemas 合并 |
| `registry.ts` | 注册表：handler + schema、分发执行、高危评估、计划模式过滤 |
| `executor.ts` | 对外 `executeTool` / `executeToolWithMeta`（含截断） |
| `context.ts` | `assertAccess`、`toolCwd`、`ok` 等执行上下文 |
| `permissions.ts（含 permissions.test.ts 路径/高危门禁单测）` | 沙箱路径、高危 shell/路径模式 |
| `network-policy.ts` | `networkMode` 限制 web / shell 出站 |
| `shell-runner.ts` | 可中止 shell；开发服务器就绪后放后台；长命令 `onStatus` 进度回传 |
| `truncate.ts` | 工具输出截断 |
| `tool-groups.ts` | 工具分组与计划模式白名单 |
| `harness-state.ts` | 计划模式 / Build / 按会话隔离的 worktree 运行时状态 |
| `thread-worktree.ts` | 为会话创建或复用 `~/.sharker/worktrees` 隔离 worktree；可选起点分支；按 `.worktreeinclude` 拷被忽略文件；默认保留最近 15 个并在删除前快照；归档可移除；项目菜单可建永久 worktree（`worktrees/permanent/`，不自动删）；`inspectWorktreePath` 探活目录与快照 |
| `thread-worktree.test.ts` | worktree 创建/复用、include 拷贝、起点分支、非 git 拒绝、清理与快照恢复 |
| `builtins/present-inline-demo.ts` | 对话内嵌 HTML 演示（不写文件、不开浏览器） |
| `ARCH.md` | 本层架构说明 |

## 对外接口

- `executeTool(name, args, settings): Promise<string>` — 仅文本（给模型）
- `executeToolWithMeta(...): Promise<ToolRunResult>` — 含 `fileDiff` / `fileDiffs` 等元数据（给 UI）

## 扩展指南（新增 Tool）

1. 在 `schemas.ts`（或 `schemas-extended.ts`）增加 OpenAI schema
2. 在 `builtins/` 新建 handler，实现 `ToolHandler`
3. 在 `registry.ts` 的 `getAllToolHandlers()` 注册
4. 路径/危险操作实现 `assessRisk` / `extractPaths`
5. 更新 [docs/agent-capabilities.md](../docs/agent-capabilities.md)

无需改 `executor.ts` 或 `agent/tool-definitions.ts`（后者 re-export 注册表）。

## 依赖

- `shared/workspace`、`shared/types` 等
- Node `fs` / `child_process`

## 相关

- 安装与诊断：[docs/computer-use-setup.md](../docs/computer-use-setup.md)
- 能力一览：[docs/agent-capabilities.md](../docs/agent-capabilities.md)
