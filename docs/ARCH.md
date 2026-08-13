# docs — 全局设计与使用文档

## 职责

- 跨模块专题：架构、能力、路线图、安装、UI 风格、文档维护方式
- **不**替代各业务目录的同级 `ARCH.md` 地图（见 [DOC-GUIDE.md](./DOC-GUIDE.md)）

## 同级目录

| 目录 | 说明 |
|------|------|
| [github/](./github/ARCH.md) | GitHub README 英雄图与能力条 |

## 同级文件

| 文件 | 说明 |
|------|------|
| `ARCH.md` | 本层索引（文档分层 + 顶层模块入口） |
| `ARCHITECTURE.md` | 系统架构、进程划分、数据流 |
| `agent-capabilities.md` | Agent 能做什么、工具与策略 |
| `inline-demo-spec.md` | **内联可视化**生成/渲染强制规范（布局、按钮、假终端） |
| `computer-use-setup.md` | macOS Computer / Browser / Voice 安装 |
| `roadmap-harness.md` | Harness 路线图与已拍板里程碑 |
| `roadmap-features.md` | 功能向路线图补充 |
| `DOC-GUIDE.md` | 文档驱动开发 + **逐层架构说明**规范 |
| `ui-style.md` | UI 风格：浅色水滴玻璃 / 深色金属 |
| `gap-matrix-grok-app.md` | 对标 grok-app 工作台能力的 gap 矩阵（have/partial/missing） |

## 文档分层

| 层级 | 作用 |
|------|------|
| 根 [README.md](../README.md) | GitHub 产品页：英雄图、能力条、启动 |
| **本目录** | 跨模块专题 |
| **各目录 `ARCH.md`** | 逐层架构说明：只写同级文件夹与文件 |

**强制规范**：有源码/配置意义的目录每一层都要有 `ARCH.md`。细则见 [DOC-GUIDE.md](./DOC-GUIDE.md)。

## 顶层模块入口

更深子目录从入口 `ARCH.md` 往下钻。

| 模块 | 路径 | 职责 |
|------|------|------|
| Agent 循环 | [../agent/ARCH.md](../agent/ARCH.md) | Harness 核心 |
| 工具执行 | [../tools/ARCH.md](../tools/ARCH.md) | 看搜改跑、权限、截断 |
| 模型 Provider | [../providers/ARCH.md](../providers/ARCH.md) | OpenAI 兼容 API |
| 共享类型/逻辑 | [../shared/ARCH.md](../shared/ARCH.md) | 类型、IPC、上下文 |
| Electron 主进程 | [../electron/ARCH.md](../electron/ARCH.md) | IPC、存储、窗口 |
| 前端 UI | [../src/ARCH.md](../src/ARCH.md) | React 界面 |
| 脚本 | [../scripts/ARCH.md](../scripts/ARCH.md) | 开发启动与环境安装 |

## 阅读顺序（新人 / AI）

1. 根目录 [README.md](../README.md)
2. [ARCHITECTURE.md](./ARCHITECTURE.md)（系统级架构，与各目录 `ARCH.md` 不同）
3. 你要改的 **目录** 的 `ARCH.md`
4. Agent 行为 → [agent-capabilities.md](./agent-capabilities.md) 与 [roadmap-harness.md](./roadmap-harness.md)
5. 内联演示 → [inline-demo-spec.md](./inline-demo-spec.md)
6. UI / 主题 → [ui-style.md](./ui-style.md)
