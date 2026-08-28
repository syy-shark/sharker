# src — React 前端

## 职责

- 聊天、侧栏工作区/对话、设置页、自动化页
- **Agent 执行轨道**（理解 → 探索 → 执行 → 验证）、过程内审批、上下文环
- **不**直接执行工具或调用模型（仅通过 `window.sharker` IPC）

## 同级目录

| 目录 | 说明 |
|------|------|
| [components/](./components/ARCH.md) | 聊天、侧栏、轨道、右侧面板、设置子组件等 |
| [pages/](./pages/ARCH.md) | 设置页、自动化页等整页壳 |
| [styles/](./styles/ARCH.md) | 全局 token、玻璃材质、动效 |
| [hooks/](./hooks/ARCH.md) | 弹层动画、滑动指示器等 UI hooks |
| [lib/](./lib/ARCH.md) | 纯前端小工具（相对时间等） |
| [constants/](./constants/ARCH.md) | 布局尺寸与断点常量 |
| [types/](./types/ARCH.md) | 仅 UI 侧类型（导航、排队 prompt） |
| [assets/](./assets/ARCH.md) | Logo 等静态图 |

## 同级文件

| 文件 | 说明 |
|------|------|
| `main.tsx` | React 入口：挂载根节点 + ErrorBoundary |
| `App.tsx` | 全局状态、发送/排队、流式 chunk → 片段（直播浅拷贝、flush 不二次深拷）、多会话 buffer 快照恢复（切回优先内存 buffer，含已完成未落盘）、设置/对话切换；人格写入 system prompt；`/fork` 分叉线程（不复用 worktreePath）；`/side` 旁路新线程并弹出窗（不切走当前对话）；`/archive` `/init` `/permissions` `/memories` `/copy` `/fast` `/skills` `/stop`；行首 `!` 打开终端执行；⌘⇧O 新对话；`/status` `/diff` `/goal` `/mcp` `/feedback` `/local` `/worktree`；思考标志只置一次；直播节流审查面板刷新；隔离目录缺失时探活并提供恢复；自动化到期进审查队列（新对话 + 隔离 worktree 后台跑）；会话线程模式（本地 / 隔离 worktree）随 conversationId 恢复，切换时交接代码；`/review` 默认独立线程；工具写盘抬 `changesRevision` 刷新审查面板并收集本轮写盘路径（Last turn）；`/review` 打开审查并派发只读评审；行内审查评论回灌当前对话；主线程点开子 Agent 打开活动并选中；Codex 工作台快捷键（⌘B 侧栏、⌘⌥B 审查、⌘J / Ctrl+` 终端、⌘⇧E 文件、⌘⇧B / ⌘T 浏览器、⌘N 新对话、⌘, 设置、⌘O 开文件夹、⌘K / ⌘⇧P 命令面板、⌘/ 快捷键一览、⌘⇧[ / ⌘⇧] / ⌘1–9 切线程、⌘[ / ⌘] 前进后退、⌘+ / ⌘- / ⌘0 字号、Ctrl+L 清终端、⇧Esc 清未读、⌘⇧A 归档、⌘⌥S 旁路、⌘⌥A 进行中、⌘P 搜文件）；命令面板可打开线程查找；设置草稿不得回写 activeWorkspace；新对话不清其他会话 streamOwner，并乐观写入侧栏摘要后后台刷新；Stop 先标 cancelled 再 abort，忽略迟到 tool 进度；重试立即 seed 直播头并抬 turnGen；插队本地收口后立即派发本条；在新 turn_start 前忽略旧 abort 的迟到 done；DEV 下 `window.__sharkerDebug` 可注入真实审批/错误/直播态（injectError 兼容 string / `{message}`），并切换页面/右栏 Tab；侧栏标题乐观更新 + 进行中标记；会话切换避免空白闪帧 |
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
