# src/components — UI 组件

## 职责

- 聊天主界面、执行轨道、侧栏、标题栏、右侧面板与设置子面板等可复用组件
- 成对的 `.tsx` + `.css` 为组件本体与样式；材质遵循 [docs/ui-style.md](../../docs/ui-style.md)

## 同级目录

| 目录 | 说明 |
|------|------|
| [panel/](./panel/ARCH.md) | 右侧面板：文件树、集成终端、内置浏览器 |
| [settings/](./settings/ARCH.md) | 设置页各 Tab 与通用设置原语 |

## 同级文件

| 文件 | 说明 |
|------|------|
| `Sidebar.tsx` / `.css` | 侧栏：导航/项目/对话（`data-conversation-id/title` 便于自动化恢复）；进行中会话呼吸点；项目菜单 enter/exit 统一 180ms 卸载；展开时顶栏收起按钮；收起后左缘热区 peek（pointer/mouse）滑入 |
| `ChatView.tsx` / `.css` | 聊天主视图：消息列表、输入、排队、滚动；提交时拦截 UI 斜杠命令；`/history` 历史选择弹层（浅色玻璃/深色金属，↑↓/Enter/Esc 与 hover 同步，关闭有退出动画并真正卸载、回焦输入框） |
| `ChatToolbar.tsx` / `.css` | 聊天顶栏：侧栏展开/收起、新对话、右侧面板 |
| `AssistantMessage.tsx` / `.css` | 助手消息：直播过程在上；错误/中止卡有进入动画；完成后过程可展开且无 thinking 原文 |
| `TurnFlow.tsx` / `.css` | 直播过程：呼吸灯、阶段轨、步骤时间线；thinking 永不暴露原文；完成后滤桥接 status/工具回声；头文案粘滞；hooks 在 early return 前 |
| `ProcessTimeline.tsx` / `.css` | 旧消息回退过程时间线 |
| `InlineApproval.tsx` / `.css` | 过程内高危操作审批块；出现时 view-enter + 呼吸 |
| `ThinkingIndicator.tsx` / `.css` | 兼容旧路径的轻量「处理中」；直播主路径用 TurnFlow 呼吸头 |
| `MarkdownBody.tsx` | Markdown 渲染；代码/diff 分流 |
| `CodeArtifactBlock.tsx` / `.css` | 代码与命令输出编辑器外壳 |
| `CodeDiffBlock.tsx` / `.css` | 行级 diff 展示 |
| `CompareBlock.tsx` / `.css` | 旧/新对比行布局 |
| `MessageActions.tsx` / `.css` | 消息复制等操作 |
| `ModelPicker.tsx` / `.css` | 输入区模型选择；弹层关闭与 history 对齐（exit 后卸载）；退出期间保持 expanded 壳宽不塌 |
| `PlanBuildBar.tsx` / `.css` | 计划就绪后的 Build 操作栏 |
| `RightPanel.tsx` / `.css` | 右侧可调宽面板（文件/终端/浏览器）；全屏时隐藏下层防叠字；`right-panel--compact` 抽屉 + 遮罩 enter/exit（遮罩自带 motion token，不依赖 panel 变量） |
| `InlineDemo.tsx` / `.css` | 对话内联演示 iframe |
| `ProviderBrandIcon.tsx` / `.css` | 模型厂商官方标识图标（DeepSeek / xAI / OpenAI / Kimi / 智谱） |
| `ErrorBoundary.tsx` | 渲染错误捕获与降级 |
| `ARCH.md` | 本层架构说明 |
