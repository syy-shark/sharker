# Sharker 源码仓库 — AI 协作说明

本文件给 **修改 Sharker 本身** 的人和 AI 使用。用户工作区内的项目规则将来放在 `<workspace>/.sharker/AGENTS.md`。

## 必读

1. [docs/ARCH.md](docs/ARCH.md) — 文档索引
2. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — 架构与数据流
3. [docs/DOC-GUIDE.md](docs/DOC-GUIDE.md) — 文档规范（含 **逐层架构说明**）
4. 你要改的 **那个目录** 下的 `ARCH.md`（如 `agent/ARCH.md`、`tools/builtins/ARCH.md`）
5. 改 UI / 新组件时再读 [docs/ui-style.md](docs/ui-style.md) — 浅色水滴玻璃 / 深色金属

## 开发约定

- **文档驱动**：改行为 → 同步改对应层 `ARCH.md` + 必要时 `docs/agent-capabilities.md`
- **逐层架构说明（强制）**：每一个有源码/配置意义的目录都要有 `ARCH.md`，只说明 **本层同级** 的文件夹与文件；子目录各自再有一份，递归下去。新建目录/文件时同步更新本层与父层表格。细则见 [docs/DOC-GUIDE.md](docs/DOC-GUIDE.md)
- **Harness 逻辑**在 `agent/` 与 `tools/`，不在 React 组件里
- **类型契约**在 `shared/types.ts`，IPC 在 `shared/ipc.ts`
- **UI 材质**：浅色固定水滴玻璃、深色固定金属；新功能/组件按 [docs/ui-style.md](docs/ui-style.md)
- 不提交 API Key；设置经 `safeStorage` 加密

## 常用命令

```bash
npm install
npm run dev    # 开发
npm run build  # 构建
```

## 路线图

已拍板方向见 [docs/roadmap-harness.md](docs/roadmap-harness.md)：看搜改跑、主动测试、读项目、全局/项目记忆、自进化、Office 全套件、视频等。
