# src — React 前端

## 职责

- 聊天、侧栏工作区/对话、设置页
- **有序过程流**（思考 → 旁白 → 读/改文件 → 最终回答）、审批弹窗、上下文环
- **不**直接执行工具或调模型

## 关键文件

| 文件 | 说明 |
|------|------|
| `App.tsx` | 全局状态、`handlePromptSubmit` 排队/插队、流式 chunk → `TurnSegment[]`、设置/对话切换 |
| `components/ChatView.tsx` | 消息列表、排队气泡、输入框、贴底滚动跟随 |
| `components/AssistantMessage.tsx` | AI 消息、直播过程流 + 结束后摘要 chip、最终回答 |
| `components/TurnFlow.tsx` | 有序片段 UI：思考块、旁白、工具步骤卡、编辑 diff |
| `components/CodeDiffBlock.tsx` | 行级绿加红删 diff（过程流 + Markdown） |
| `components/MarkdownBody.tsx` | Markdown 渲染；` ```diff ` 代码块高亮 |
| `components/WorkspaceList.tsx` | 侧栏工作区与对话树 |
| `components/Sidebar.tsx` | 侧栏壳、设置入口 |
| `pages/SettingsPage.tsx` | 模型 / 权限 / Skills 设置 |
| `components/ProcessTimeline.tsx` | 旧消息回退：思考与工具步骤 UI |

## 过程流数据

- 类型：`shared/types.ts` 中 `TurnSegment`
- 归并：`shared/turn-segments.ts` 将 `think` / `token` / `tool_*` chunk 按真实顺序合成片段；`tool_done` 按 `toolCallId` 挂 `fileDiff`
- 持久化：回合结束时写入 `AssistantMeta.segments`，历史可展开重看
- 编辑步骤：`write_file` / `search_replace` 完成后在步骤卡下展示 `CodeDiffBlock`
- 助手回复：Markdown 中 ` ```diff `  fenced 块同样走 `CodeDiffBlock`

## 样式

- `styles/global.css` — 设计 token、玻璃质感变量
- `styles/glass.css` — 水晶玻璃工具类
- `styles/motion.css` — 动效曲线

## 与主进程通信

仅通过 `window.sharker.*`（见 `vite-env.d.ts`），对应 [electron/preload](../electron/preload/index.ts)。

## 扩展指南

- 新页面：改 `types/navigation.ts` + `Sidebar` 路由 + `App.tsx` pane
- 新 StreamChunk UI：改 `App.tsx` onStream + 对应组件
- 新设置项：Settings 子页 + `AppSettings` 类型 + `settings-store`

## 文档

- [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)
