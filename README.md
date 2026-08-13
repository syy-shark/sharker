# Sharker

Sharker 是一个本地优先的 **macOS** 桌面 AI 助手，用 Electron、React 和 TypeScript 构建。它把聊天界面、代码 Harness、工具调用、长期记忆和桌面自动化放在同一个应用里，目标是在你的 Mac 上完成「看、搜、改、跑、验证、提交」这类真实工作。

模型 Provider 使用 OpenAI 兼容接口。

## 主要能力

- **代码工作流**：读取文件、搜索、编辑、运行命令、自动验证、Git 操作。
- **Agent Harness**：流式响应、工具审批、只读工具并行、上下文压缩、`@file` 引用、Plan/Build 模式。
- **模块化工具系统**：内置文件、Shell、Git、Web、Browser、Desktop、Voice 等工具。
- **长期记忆**：使用 PGlite 存储会话、项目、事件和记忆检索数据。
- **桌面自动化**：`desktop_*`（screencapture / osascript / cliclick）。
- **应用 UI**：对话、时间线、设置页、Computer Use/Browser Use/插件配置、右侧面板、嵌入终端与文件树。

## 文档入口

| 入口 | 说明 |
|------|------|
| [docs/ARCH.md](docs/ARCH.md) | **文档索引**（全局 + 各模块） |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 系统架构 |
| [docs/agent-capabilities.md](docs/agent-capabilities.md) | Agent 能力、工具与策略 |
| [docs/computer-use-setup.md](docs/computer-use-setup.md) | Computer / Browser / Voice 安装说明 |
| [docs/roadmap-harness.md](docs/roadmap-harness.md) | Harness 路线图 |
| [AGENTS.md](AGENTS.md) | 给 AI / 协作者的本仓库说明 |

各有源码意义的目录均有 **同级架构说明** `ARCH.md`（说明本层文件夹与文件；子目录各自再有一份）。规范见 [docs/DOC-GUIDE.md](docs/DOC-GUIDE.md)。

## 快速开始

```bash
npm install
npm run dev
```

要求：**macOS**、Node.js 20+。

首次打开后：

1. 在设置里选择工作区。
2. 配置 OpenAI 兼容 Provider：Base URL、API Key、模型 ID。
3. 按需要开启模型视觉能力、网络策略、权限模式。
4. 回到对话页，让 Sharker 处理代码或桌面任务；高危操作会弹窗确认。

## 常用命令

```bash
npm run dev       # 开发模式
npm run build     # 生产构建
npm run preview   # 预览构建产物
```

## 目录结构

每一层的详细同级说明见该目录 `ARCH.md`（规范：[docs/DOC-GUIDE.md](docs/DOC-GUIDE.md)）。

```text
sharker/
├── agent/          # Harness：管线、query loop、验证、记忆、@file
├── tools/          # 工具 schema、registry、builtins、权限
├── providers/      # OpenAI 兼容 Provider
├── shared/         # 类型、IPC、上下文、workspace、共享逻辑
├── electron/       # 主进程、preload、设置与持久化
├── src/            # React UI
├── skills/         # Skill 加载器与内置 bundled 技能
├── scripts/        # 开发启动与 Computer/Browser/Voice 安装
├── docs/           # 全局设计与使用文档
├── public/         # 公开静态资源
└── resources/      # 打包用应用图标等
```

## 工作区与持久化

- 应用设置保存在 Electron `userData` 目录，API Key 使用 `safeStorage` 加密。
- 会话、长期记忆和 Agent 事件保存在 `~/.sharker/memory-db`。
- 用户项目规则未来放在 `<workspace>/.sharker/AGENTS.md`。

## 桌面自动化

内置 `desktop_*` 工具：`screencapture`、`osascript`、可选 `cliclick`。

需在「系统设置 → 隐私与安全性」中授权 **辅助功能** 与 **屏幕录制**。安装与诊断见 [docs/computer-use-setup.md](docs/computer-use-setup.md)。

## 开发约定

- **逐层架构说明**：每个有源码/配置意义的目录维护 `ARCH.md`，只写同级目录与文件职责；新增目录/文件时同步更新本层与父层。见 [docs/DOC-GUIDE.md](docs/DOC-GUIDE.md)。
- 改行为时同步更新对应层 `ARCH.md`，必要时更新 [docs/agent-capabilities.md](docs/agent-capabilities.md)。
- Harness 逻辑放在 `agent/` 与 `tools/`，不要塞进 React 组件。
- 类型契约放在 `shared/types.ts`，IPC 常量放在 `shared/ipc.ts`。
- 不提交 API Key、本地数据库、构建缓存或嵌套仓库副本。

## 状态

Sharker 仍在快速迭代中。已实现的 Harness 能力见 [docs/agent-capabilities.md](docs/agent-capabilities.md)，路线图见 [docs/roadmap-harness.md](docs/roadmap-harness.md)。
