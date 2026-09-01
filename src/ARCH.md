# src — React 前端

## 职责

- 聊天、侧栏工作区/对话、设置页、自动化页
- **Agent 执行轨道**（理解 → 探索 → 执行 → 验证）、过程内审批、上下文环
- **不**直接执行工具或调用模型（仅通过 `window.sharker` IPC）

## 同级目录

| 目录 | 说明 |
|------|------|
| [components/](./components/ARCH.md) | 聊天、侧栏、轨道、右侧面板、设置子组件等 |
| [pages/](./pages/ARCH.md) | 设置页、自动化页、Skills 页等整页壳 |
| [styles/](./styles/ARCH.md) | 全局 token、玻璃材质、动效 |
| [hooks/](./hooks/ARCH.md) | 弹层动画、滑动指示器、直播 token / 回合元信息外部 store、屏外扫光暂停 |
| [lib/](./lib/ARCH.md) | 纯前端小工具（相对时间等） |
| [constants/](./constants/ARCH.md) | 布局尺寸与断点常量 |
| [types/](./types/ARCH.md) | 仅 UI 侧类型（导航、排队 prompt） |
| [assets/](./assets/ARCH.md) | Logo 等静态图 |
| [shims/](./shims/ARCH.md) | 渲染进程里替 `node:crypto` / `node:util` |
| [maka-core/](./maka-core/README.zh-CN.md) | 整包 Maka。根目录 `npm run dev` 启动这里的桌面，不经过 Sharker 壳。Sharker 源码仍保留，`npm run dev:sharker` 才挂 `src/App.tsx`。`packages/core/src/model-metadata.generated.ts` 由 `npm run sync:maka-metadata` 从快照生成（gitignore） |

## 同级文件

| 文件 | 说明 |
|------|------|
| `main.tsx` | React 入口：挂载根节点 + ErrorBoundary |
| `App.tsx` | Maka 管线 + 原版灰底白浮板：`variant="elevated"`，`.maka-panel-detail` 留 4px 缝，`.mainColumn` 是 raised 板；空态不挂会话面包屑；直播走 `LiveTurnProjection`（`applySharkerChunk` 把 StreamChunk 折成 thinking/text/tools 步），壳层只订低熵 snapshot |
| `App.css` | 应用根布局样式 |
| `index.html` | 渲染进程 HTML 壳 |
| `vite-env.d.ts` | `window.sharker` 与资源模块类型声明 |
| `ARCH.md` | 本层架构说明 |

## 过程流数据（摘要）

- 类型：`shared/types.ts` 的 `TurnSegment`
- 归并：`shared/turn-segments.ts`；展示归组：`shared/process-phases.ts`
- 完整交互约定见本文件历史说明与 [docs/ui-style.md](../docs/ui-style.md)

## 样式规范

入口：[docs/ui-style.md](../docs/ui-style.md)（浅色水滴玻璃 / 深色金属）

## 与主进程通信

仅 `window.sharker.*`（见 `vite-env.d.ts`），对应 [electron/preload](../electron/preload/ARCH.md)。

## 扩展点

- 新页面：`types/navigation.ts` + `Sidebar` + `App.tsx`
- 新 StreamChunk UI：`App.tsx` onStream + 组件
- 新设置项：`pages` / `components/settings` + `AppSettings` + `settings-store`
