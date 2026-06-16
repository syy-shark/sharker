# Sharker 源码仓库 — AI 协作说明

本文件给 **修改 Sharker 本身** 的人和 AI 使用。用户工作区内的项目规则将来放在 `<workspace>/.sharker/AGENTS.md`。

## 必读

1. [docs/README.md](docs/README.md) — 文档索引
2. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — 架构与数据流
3. 你要改的模块下的 `README.md`（如 `agent/README.md`）

## 开发约定

- **文档驱动**：改行为 → 同步改模块 README + 必要时 `docs/agent-capabilities.md`
- **Harness 逻辑**在 `agent/` 与 `tools/`，不在 React 组件里
- **类型契约**在 `shared/types.ts`，IPC 在 `shared/ipc.ts`
- 不提交 API Key；设置经 `safeStorage` 加密

## 常用命令

```bash
npm install
npm run dev    # 开发
npm run build  # 构建
```

## 路线图

已拍板方向见 [docs/roadmap-harness.md](docs/roadmap-harness.md)：看搜改跑、主动测试、读项目、全局/项目记忆、自进化、Office 全套件、视频等。
