# tools/builtins — 内置 Tool 实现

## 职责

- 各 Tool 的 `ToolHandler`（execute + 可选风险钩子）
- 单文件工具与按域分子目录（browser、desktop、mcp 等）
- Schema 仍在 `tools/schemas*.ts`；本目录只管执行侧

## 同级目录

| 目录 | 说明 |
|------|------|
| [agent/](./agent/ARCH.md) | 子 Agent spawn 等编排工具 |
| [browser/](./browser/ARCH.md) | Playwright 浏览器自动化 |
| [computer-use/](./computer-use/ARCH.md) | macOS 桌面截图/点击/键鼠 |
| [file/](./file/ARCH.md) | patch、notebook、PDF/图/图结构读取 |
| [mcp/](./mcp/ARCH.md) | MCP list / call |
| [mode/](./mode/ARCH.md) | 计划模式、worktree 模式 |
| [shell/](./shell/ARCH.md) | 后台 shell 会话 |
| [skill/](./skill/ARCH.md) | list_skills / read_skill |
| [tasks/](./tasks/ARCH.md) | 后台任务列表与控制 |
| [voice/](./voice/ARCH.md) | 语音朗读（macOS say） |
| [web/](./web/ARCH.md) | web_fetch / web_search |

## 同级文件

| 文件 | 说明 |
|------|------|
| `list-dir.ts` | 列出目录 |
| `read-file.ts` | 读文件 |
| `write-file.ts` | 写/覆盖文件（含 fileDiff） |
| `search-replace.ts` | 字符串替换（含 fileDiff） |
| `create-directory.ts` | 创建目录 |
| `delete-path.ts` | 删除路径；递归删后验证消失 |
| `move-path.ts` | 移动/重命名 |
| `glob-file-search.ts` | glob 找文件 |
| `grep.ts` | 目录内文本搜索 |
| `run-terminal-cmd.ts` | 工作区 shell；rm -rf 后自动验证 |
| `git.ts` | Git 工具组（status/diff/log/add/commit/pull/push…） |
| `open-url.ts` | 系统浏览器打开 URL |
| `run-skill-script.ts` | 执行 Skill 目录脚本 |
| `uninstall-application.ts` | macOS 应用卸载流水线 |
| `verify-removal.ts` | 检查卸载/路径残留 |
| `ARCH.md` | 本层架构说明 |

## 注册

新 handler 实现后在 `tools/registry.ts` 注册，并补 schema。
