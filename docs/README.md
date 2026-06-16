# Sharker 文档索引

本项目采用 **文档驱动开发**：改代码前先读文档，改代码后同步更新文档。人和 AI 都应以文档为入口理解系统。

## 全局文档

| 文档 | 说明 |
|------|------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 系统架构、进程划分、数据流 |
| [agent-capabilities.md](./agent-capabilities.md) | Agent 能做什么、工具有哪些 |
| [roadmap-harness.md](./roadmap-harness.md) | Harness 路线图与里程碑 |
| [DOC-GUIDE.md](./DOC-GUIDE.md) | 如何维护文档（给人和 AI） |

## 模块文档（每个目录一份 README）

| 模块 | 路径 | 职责 |
|------|------|------|
| Agent 循环 | [../agent/README.md](../agent/README.md) | Harness 核心：loop、verify、工具定义 |
| 工具执行 | [../tools/README.md](../tools/README.md) | 看搜改跑、权限、截断 |
| Skills | [../skills/README.md](../skills/README.md) | Skill 加载与注入 |
| 模型 Provider | [../providers/README.md](../providers/README.md) | OpenAI 兼容 API、流式 |
| 共享类型/逻辑 | [../shared/README.md](../shared/README.md) | 类型、IPC、上下文、对话 |
| Electron 主进程 | [../electron/README.md](../electron/README.md) | IPC、存储、对话持久化 |
| 前端 UI | [../src/README.md](../src/README.md) | React 界面、组件 |

## 阅读顺序（新人 / AI）

1. 根目录 [README.md](../README.md)
2. [ARCHITECTURE.md](./ARCHITECTURE.md)
3. 你要改的那个模块的 `README.md`
4. 若动 Agent 行为，再读 [agent-capabilities.md](./agent-capabilities.md) 与 [roadmap-harness.md](./roadmap-harness.md)
