# Sharker

Sharker 是一个本地优先的桌面 AI 助手，用 Electron、React 和 TypeScript 构建。它把聊天界面、代码 Harness、工具调用、MCP、Skills、长期记忆和桌面自动化放在同一个应用里，目标是在你的电脑上完成「看、搜、改、跑、验证、提交」这类真实工作。

当前重点面向 Ubuntu / WSL / Windows 开发环境；模型 Provider 使用 OpenAI 兼容接口。

## 主要能力

- **代码工作流**：读取文件、搜索、编辑、运行命令、自动验证、Git 操作。
- **Agent Harness**：流式响应、工具审批、只读工具并行、上下文压缩、`@file` 引用、Plan/Build 模式。
- **模块化工具系统**：内置文件、Shell、Git、Web、Browser、Desktop、Voice、MCP 等工具。
- **MCP 动态工具池**：每轮自动读取 MCP server 的 `tools/list`，并以 `mcp_<server>__<tool>` 形式注入模型。
- **Skills**：兼容 Claude Code 的 `.claude/skills/`，也支持 Sharker 自己的 `.sharker/skills/`。
- **长期记忆**：使用 PGlite 存储会话、项目、事件和记忆检索数据。
- **桌面自动化**：支持 ydotool 回退、cua-driver / Codex computer-use MCP、截图视觉回灌。
- **应用 UI**：对话、时间线、设置页、MCP/Computer Use/Browser Use/Voice/插件与技能配置、右侧面板、嵌入终端与文件树。

## 文档入口

| 入口 | 说明 |
|------|------|
| [docs/README.md](docs/README.md) | **文档索引**（全局 + 各模块） |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 系统架构 |
| [docs/agent-capabilities.md](docs/agent-capabilities.md) | Agent 能力、工具与策略 |
| [docs/computer-use-setup.md](docs/computer-use-setup.md) | Computer / Browser / Voice 安装说明 |
| [docs/roadmap-harness.md](docs/roadmap-harness.md) | Harness 路线图 |
| [AGENTS.md](AGENTS.md) | 给 AI / 协作者的本仓库说明 |

各模块目录均有 `README.md`：`agent/`、`tools/`、`src/`、`electron/`、`shared/`、`providers/`、`skills/`。

## 快速开始

```bash
npm install
npm run dev
```

首次打开后：

1. 在设置里选择工作区。
2. 配置 OpenAI 兼容 Provider：Base URL、API Key、模型 ID。
3. 按需要开启模型视觉能力、网络策略、权限模式、Skills、MCP。
4. 回到对话页，让 Sharker 处理代码或桌面任务；高危操作会弹窗确认。

### Windows

PowerShell 默认可能禁止运行 `npm.ps1`（`UnauthorizedAccess`）。任选其一：

```cmd
dev.cmd
```

```cmd
scripts\launch-sharker.cmd
```

```cmd
npm.cmd run dev:win
```

项目路径含中文（如 `项目`）时，启动脚本会自动 `SUBST Z:` 再跑 Vite；不要直接在中文路径下 `npm run dev`。

若希望 PowerShell 里也能用 `npm run`，可一次性放宽当前用户策略（可选）：

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

## 常用命令

```bash
npm run dev       # 开发模式
npm run dev:win   # Windows 启动脚本
npm run build     # 生产构建
npm run preview   # 预览构建产物
```

## 目录结构

```text
sharker/
├── agent/          # Harness：管线、query loop、验证、记忆、@file
├── tools/          # 工具 schema、registry、builtins、MCP、权限
├── skills/         # Skill 发现、选择与 prompt 注入
├── providers/      # OpenAI 兼容 Provider
├── shared/         # 类型、IPC、上下文、workspace、共享逻辑
├── electron/       # 主进程、preload、设置与持久化
├── src/            # React UI
├── scripts/        # 启动与 Computer/Browser/Voice 安装脚本
├── third_party/    # 第三方辅助资源与 NOTICE
└── docs/           # 全局设计与使用文档
```

## 工作区与持久化

- 应用设置保存在 Electron `userData` 目录，API Key 使用 `safeStorage` 加密。
- 会话、长期记忆和 Agent 事件保存在 `~/.sharker/memory-db`。
- MCP 配置读取 `<workspace>/.sharker/mcp.json`，没有则读取 `~/.sharker/mcp.json`。
- 用户项目规则未来放在 `<workspace>/.sharker/AGENTS.md`。

## Skill

兼容 Claude Code：优先读 `.claude/skills/`，其次 `.sharker/skills/`（同名时 `.claude` 优先）。

- Claude Code 全局：`~/.claude/skills/<name>/SKILL.md`
- Claude Code 项目：`<工作区>/.claude/skills/<name>/SKILL.md`
- Sharker 全局：`~/.sharker/skills/<name>/SKILL.md`
- Sharker 项目：`<工作区>/.sharker/skills/<name>/SKILL.md`
- 设置中可从 GitHub 仓库导入到 `~/.sharker/skills/`

## MCP 与桌面自动化

MCP 示例见 [tools/mcp.example.json](tools/mcp.example.json)。设置页可编辑 MCP JSON 并测试连接。

桌面自动化有两条路径：

- **内置回退**：`desktop_*` 工具使用 ydotool、截图 CLI、wmctrl / hyprctl 等 Linux 工具。
- **推荐 MCP**：cua-driver 或 Codex computer-use MCP，提供窗口状态、截图、绝对坐标输入等能力。

安装与诊断请看 [docs/computer-use-setup.md](docs/computer-use-setup.md)。

## 开发约定

- 改行为时同步更新模块 README，必要时更新 [docs/agent-capabilities.md](docs/agent-capabilities.md)。
- Harness 逻辑放在 `agent/` 与 `tools/`，不要塞进 React 组件。
- 类型契约放在 `shared/types.ts`，IPC 常量放在 `shared/ipc.ts`。
- 不提交 API Key、本地数据库、构建缓存或嵌套仓库副本。

## 状态

Sharker 仍在快速迭代中。已实现的 Harness 能力见 [docs/agent-capabilities.md](docs/agent-capabilities.md)，路线图见 [docs/roadmap-harness.md](docs/roadmap-harness.md)。
