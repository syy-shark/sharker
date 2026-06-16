# tools — 看 · 搜 · 改 · 跑

## 职责

- **执行** 模型发起的所有 tool calls
- **权限**：工作区沙箱、路径检查、高危命令识别
- **输出卫生**：过长结果截断，避免撑爆上下文

## 关键文件

| 文件 | 说明 |
|------|------|
| `executor.ts` | `executeTool` / `executeToolWithMeta` / `runTool`，所有工具 switch |
| `shell-runner.ts` | 可中止 shell、开发服务器就绪探测后放后台（排空 stdout 避免 EPIPE） |
| `permissions.ts` | `checkPathAccess`、`isHighRiskTool`、`resolveCommandCwd` |
| `truncate.ts` | `truncateToolOutput`、`truncateLines` |

## 已有工具一览

**看搜**：`list_dir`、`glob_file_search`、`grep`、`read_file`  
**改**：`write_file`、`search_replace`、`delete_path`、`move_path`、`create_directory`  
**跑**：`run_terminal_cmd`（可中止、开发服务器日志/TCP 探测真实端口后后台化）、全套 `git_*`、`run_skill_script`

## 开发服务器行为

- 不再对 `npm run` 强塞 `--port`；优先 `PORT`/`VITE_PORT` 环境变量
- 从 stdout/stderr 解析 `http://localhost:<port>` 等监听地址
- TCP 探测端口就绪后提前返回可打开链接
- 后台化时持续排空管道，避免子进程因 EPIPE 退出

## 对外接口

- `executeTool(name, args, settings): Promise<string>` — 仅文本输出（给模型上下文）
- `executeToolWithMeta(...): Promise<ToolRunResult>` — 含 `fileDiff`（`write_file` / `search_replace` 行级 diff，供 UI 绿加红删）

编辑类工具返回给模型的仍是短句（如 `Updated path (+1 -1)`）；完整 diff 经 `StreamChunk.fileDiff` 推到前端，不塞进 tool message。

## 依赖

- `shared/workspace` — 当前工作区路径
- Node `fs`、`child_process`

## 扩展指南

1. 在 `agent/tool-definitions.ts` 增加 schema
2. 在 `executor.ts` `runTool` 增加 case
3. 若涉及路径或危险操作，更新 `permissions.ts`
4. 更新 [docs/agent-capabilities.md](../docs/agent-capabilities.md)

## 路线图

- `apply_patch`、编辑快照、Office/视频 封装为 tools 或 skill 脚本 → 见 [roadmap-harness.md](../docs/roadmap-harness.md)
