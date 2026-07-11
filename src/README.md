# src — React 前端

## 职责

- 聊天、侧栏工作区/对话、设置页
- **Agent 执行轨道**（理解 → 探索 → 执行 → 验证）、过程内审批、上下文环
- **不**直接执行工具或调模型

## 关键文件

| 文件 | 说明 |
|------|------|
| `App.tsx` | 全局状态、`handlePromptSubmit` 排队/插队、流式 chunk → `TurnSegment[]`、设置/对话切换 |
| `components/ChatView.tsx` | 消息列表、排队气泡、克制聚焦输入区、附件、贴底滚动跟随 |
| `components/AssistantMessage.tsx` | AI 消息、执行轨道、完成摘要、过程内审批与最终回答 |
| `components/TurnFlow.tsx` | 理解 / 探索 / 执行 / 验证四阶段轨道与文件变更入口 |
| `components/CodeArtifactBlock.tsx` | 普通代码与命令输出的统一编辑器外壳 |
| `components/CodeDiffBlock.tsx` | 复用编辑器外壳的静态行级 diff |
| `components/InlineApproval.tsx` | 执行轨道内的单次授权审批块 |
| `components/MarkdownBody.tsx` | Markdown 渲染；代码与 diff 产物分流 |
| `components/WorkspaceList.tsx` | 侧栏工作区与对话树 |
| `components/Sidebar.tsx` | 侧栏壳、设置入口 |
| `pages/SettingsPage.tsx` | 模型 / 权限 / Skills 设置 |
| `components/ProcessTimeline.tsx` | 旧消息回退：高层思考状态与工具步骤 UI |

## 过程流数据

- 类型：`shared/types.ts` 中 `TurnSegment`
- 归并：`shared/turn-segments.ts` 将 `think` / `status` / `token` / `tool_*` chunk 按真实顺序合成片段；详细 `think` 不直接展开，`tool_done` 按 `toolCallId` 挂 `fileDiff` / `fileDiffs`
- 展示归组：`shared/process-phases.ts` 只在展示层从片段、工具名和命令推导四阶段、统计与摘要，不修改数据库或旧会话
- 持久化：回合结束时写入 `AssistantMeta.segments`，历史可展开重看
- 运行时只展开当前阶段和最近两个完成步骤；完成后折叠为单行统计，点击可恢复完整轨道
- 直播轨道只展示已经到达的阶段，未来阶段不占位；已完成阶段收成单行，当前阶段承载唯一活动主线
- 实时阶段头是当前状态与耗时的唯一展示位置；连续重复的 thinking/status 步骤在展示层合并
- 完成态默认使用中性紧凑摘要；展开后会隐藏与阶段头同义的单一 thinking/status 子步骤，真实工具、Diff 与错误仍完整保留
- 新旧两套过程数据在仅处于思考阶段时都使用无圆点、无外框的紧凑状态行，“思考中”文字以低对比度流光循环；进入工具阶段后平滑展开为轻量轨道
- 用户向上滚动或审批卡出现后会进入阅读锁，流式 RAF 不再写入滚动位置；只有点击“回到底部”才恢复持续贴底
- 文件变更统计以短时计数动画展示已知目标行数，减少动态效果模式下直接显示最终值
- 代码、命令输出和 diff 统一为固定头部、复制操作、行号与稳定滚动高度；增删统计保持静态
- 审批只存在于当前执行轨道并继续复用现有 IPC，不写入历史消息

## 样式

- `styles/global.css` — 浅色工作台的语义 token；品牌蓝用于行动，结果状态使用独立语义色
- `styles/glass.css` — 仅供浮层等少量半透明表面复用
- `styles/motion.css` — 120 / 180 / 220ms 三档动效与 reduced-motion
- `constants/layout.ts` — 侧栏、右侧面板尺寸及 1120px 响应式断点

## 工作台布局

- 标题栏 42px；左栏默认 248px（220–320px，可折叠为 52px）
- 中栏是独立滚动的会话区，正文与输入区最大宽度 840px
- 右栏默认 400px（340–520px）；宽度低于 1120px 时改为可按 Esc 关闭的覆盖抽屉
- 输入区贴底，不重复提供工作区选择；鼠标聚焦使用轻微冷蓝内染，Tab 聚焦额外提供内侧可访问性描边，均不产生外围蓝光
- 新对话空状态展示当前工作区、快速操作和最近 3 条对话

## 消息状态

- `AssistantMeta.outcome` 区分 `success` / `error` / `aborted`
- 失败消息使用结构化错误面板；`retryOfUserMessageId` 允许最近失败回合原位重试
- 完成摘要、错误、用户停止和等待审批分别使用低饱和绿、红、灰、琥珀语义色
- 历史数据中以 `**错误**` 开头的旧消息也会自动使用错误面板展示

## 与主进程通信

仅通过 `window.sharker.*`（见 `vite-env.d.ts`），对应 [electron/preload](../electron/preload/index.ts)。

图片附件由前端读取为 data URL 后调用 `saveAttachment`，主进程复制到稳定目录；消息仅保存附件元数据与稳定路径。

## 扩展指南

- 新页面：改 `types/navigation.ts` + `Sidebar` 路由 + `App.tsx` pane
- 新 StreamChunk UI：改 `App.tsx` onStream + 对应组件
- 新设置项：Settings 子页 + `AppSettings` 类型 + `settings-store`

## 文档

- [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)

## UI motion notes

- 新阶段仅使用 120ms 透明度与 3px 位移入场，轨道展开收起为 180ms；整条轨道不重复播放入场动画。
- 同一时刻只有当前阶段标记运动；diff 数字、代码行和流式正文都不做循环或逐行动画。
- 已完成消息启用 `content-visibility: auto`；`prefers-reduced-motion` 会关闭轨道脉冲和非必要位移。
