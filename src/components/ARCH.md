# src/components — UI 组件

## 职责

- 聊天主界面、执行轨道、侧栏、标题栏、右侧面板与设置子面板等可复用组件
- 成对的 `.tsx` + `.css` 为组件本体与样式；材质遵循 [docs/ui-style.md](../../docs/ui-style.md)

## 同级目录

| 目录 | 说明 |
|------|------|
| [panel/](./panel/ARCH.md) | 右侧面板：文件树、审查、终端、浏览器、子 Agent 活动 |
| [settings/](./settings/ARCH.md) | 设置页各 Tab 与通用设置原语 |

## 同级文件

| 文件 | 说明 |
|------|------|
| `Sidebar.tsx` / `.css` | 侧栏：导航/项目/对话（`data-conversation-id/title` 便于自动化恢复）；审查队列入口与未读徽标；进行中会话呼吸点；隔离 Worktree 线程小标；项目菜单 enter/exit 统一 180ms 卸载；展开时顶栏收起按钮；收起后左缘热区 peek（pointer/mouse）滑入 |
| `ChatView.tsx` / `.css` | 聊天主视图：消息列表、输入、排队、滚动；流式贴底用 ResizeObserver + 同帧 rAF 合并写 scrollTop；远离底部的旧消息才 `content-visibility`，贴底附近保持真实高度；「回到底部」在滚动区与输入框之间的右侧槽；⌘F 线程内查找（不进全局快捷键，避免抢输入框）；Ctrl⇧D / 麦克风听写；Ctrl⇧V 语音对话（听写自动发送 + TTS）；空输入 ↑ 恢复上一条；⌘G 搜索对话；提交时拦截 UI 斜杠命令；忙时 Enter 注入 / Tab 排队 / 暂停队列；`/` 斜杠目录、`@` 文件或其它对话、`$` Skill 与历史选择弹层；composer 本地/隔离线程模式（切换即交接）；主线程子 Agent 步骤点开活动 |
| `ChatToolbar.tsx` / `.css` | 聊天顶栏：侧栏展开/收起、新对话、弹出对话、当前分支 PR 芯片、右侧面板 |
| `AssistantMessage.tsx` / `.css` | 助手消息：直播思考/工具在上；Cursor 式可折叠 Thought（无灰卡片）；正文/内联演示在下且仅可绘时上屏；完成后「已思考 · Ns」可展开，真实工具另有过程行 |
| `TurnFlow.tsx` / `.css` | 直播过程：思考为 chevron 折叠旁白；连接中一行状态字+耗时；生成演示时改头标签；有工具才展开时间线；子 Agent 步骤可点开活动 |
| `ProcessTimeline.tsx` / `.css` | 旧消息回退过程时间线；子 Agent 步骤可点开活动 |
| `InlineApproval.tsx` / `.css` | 过程内高危操作审批块；出现时 view-enter + 呼吸 |
| `ThinkingIndicator.tsx` / `.css` | 兼容旧路径的轻量「思考中」；直播主路径用 TurnFlow 状态行 |
| `MarkdownBody.tsx` | Markdown 渲染；代码/diff 分流 |
| `StreamingMarkdown.tsx` | 直播正文：`React.memo` + `useMemo` 拆分，已闭合块 memo，只重绘增长尾部 |
| `CodeArtifactBlock.tsx` / `.css` | 代码与命令输出编辑器外壳 |
| `CodeDiffBlock.tsx` / `.css` | 行级 diff；审查模式 hunk 暂存/还原 + 行内评论 |
| `CommandPalette.tsx` / `.css` | Codex 式 ⌘K / ⌘⇧P 命令面板 |
| `ShortcutsHelp.tsx` / `.css` | ⌘/ 快捷键一览 |
| `CompareBlock.tsx` / `.css` | 旧/新对比行布局 |
| `MessageActions.tsx` / `.css` | 消息复制等操作 |
| `ModelPicker.tsx` / `.css` | 输入区按接入展开全部 knownModels；触发器与菜单均用短名；点选同时切换 provider + model；弹层关闭与 history 对齐 |
| `PlanBuildBar.tsx` / `.css` | 计划就绪后的 Build 操作栏 |
| `RightPanel.tsx` / `.css` | 右侧可调宽面板（文件/审查/终端/浏览器/活动）；全屏时隐藏下层防叠字；`right-panel--compact` 抽屉 + 遮罩 enter/exit（遮罩自带 motion token，不依赖 panel 变量） |
| `InlineDemo.tsx` / `.css` | 对话内联演示：无外框、透明底、iframe 按内容真实底边撑高（只升不降） |
| `ProviderBrandIcon.tsx` / `.css` | 模型厂商官方标识图标（DeepSeek / xAI / OpenAI / Kimi / 智谱 / OpenCode） |
| `ErrorBoundary.tsx` | 渲染错误捕获与降级 |
| `ARCH.md` | 本层架构说明 |
