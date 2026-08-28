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
| `Sidebar.tsx` / `.css` | 侧栏：导航/项目/对话（`data-conversation-id/title` 便于自动化恢复）；主导航铃铛开关 Activity（⌘⌥U，未读对话徽标）；审查队列入口与未读徽标；**进行中**任务行（并行线程置顶）；**置顶**分组；对话旁 Codex 式筛选（按时间 / 进行中 / 等待回复 / 未读 / 置顶）；筛选菜单在有未读时提供「全部标为已读」（只清对话未读）；⌘⌥U 开关 Activity（默认等待回复）；进行中会话呼吸点；未读点；双击 / ⌘⌥R 行内改名；隔离 Worktree 线程小标；项目菜单含编辑项目（附加文件夹）与创建永久 worktree；enter/exit 统一 180ms 卸载；展开时顶栏收起按钮；收起后左缘热区 peek（pointer/mouse）滑入；设置导航含用量 |
| `ChatView.tsx` / `.css` | 聊天主视图：消息列表、滚动；排队条在输入框上方（不进 `.messages`，直播贴底不受排队行影响）；输入区交给 `ComposerDock`（直播 token 不重绘输入框）；流式贴底用 ResizeObserver 在布局后、绘制前写 scrollTop；审批出现后仍贴底跟随（不锁上翻）；远离底部的旧消息才 `content-visibility`，贴底附近用 `message-row--near-live`；历史行 `useMemo` + 用户气泡 `memo`；用户气泡可就地编辑并重发；空输入 Esc+Esc 回编上一条并分叉；划选历史正文出「旁路提问」（对标 Codex Ask in side chat，不抢直播行/输入框）；「回到底部」在滚动区与输入框之间的右侧槽；⌘F 线程内查找（`.composer-box` 内仍可触发）；查找打开时 ⌘G / ⌘⇧G / F3 / ⇧F3 跳命中；⌘↑ / ⌘↓ 跳到对话顶/底（输入框内不抢）；空对话建议芯片（可关）；隔离目录被清理时显示恢复横幅；主线程子 Agent 步骤点开活动；完成后改文件芯片打开审查并切到本轮；直播廉价尾与收束 Markdown 共用块边距 / 任务列表 / 图片样式 |
| `GoalProgressRow.tsx` / `.css` | 输入框上方的线程目标进度行（对标 Codex Goal）：暂停 / 继续 / 编辑 / 清除；`/goal edit` 用 `editTick` 打开编辑；`startedAt` 用独立秒表显示耗时；不接收直播 token |
| `ComposerDock.tsx` | 输入区独立树：`/` `@` `$`、历史（标题/正文/分支扩匹配）、项目选择器、附件、听写/语音、忙时 Enter 按 `followUpBehavior`（默认排队）/ ⌘⇧Enter 反转 / Tab 排队（⌃Tab / ⌘Tab 不补全也不排队）、`composerEnterBehavior` 三档（对标 Codex Enter 发送）、审批打开时 Enter 允许一次 / Esc 拒绝、计划 / 本地 / 隔离芯片（计划不跟直播 token 变、不自动开一轮）；`/` 列表并入已安装 Skill（选中写入 `$name`，不盖内置命令）；空输入 ↑ 恢复刚提交或上一条（取消运行 / 取消 worktree 创建后即使还没进对话也能恢复）；空输入 Esc+Esc 回编上一条用户气泡（不把草稿填回输入框）；粘贴优先 text/plain（避开 Office 图片层），超长收成 `Pasted text.txt` 可预览/回插；深链 `prompt=` 经 `composerSeed.nonce` 写入；不接收 `streaming` / `liveSegments`；直播中 `speechHint` 置空以免跟 token 重绘；有目标时在输入框上方挂 `GoalProgressRow` |
| `ComposerQueue.tsx` / `.css` | 输入框上方排队条（对标 Codex）：编辑 / 重排 / 发送 / 删除；不进对话滚动区，避免直播贴底跳动 |
| `ChatToolbar.tsx` / `.css` | 聊天顶栏：侧栏展开/收起、新对话、弹出对话、弹出窗 Always on top、Hand off 交接本地/隔离（对标 Codex header）、打开隔离 worktree、在此创建分支、当前分支 PR 芯片、右侧面板 |
| `AssistantMessage.tsx` / `.css` | 助手消息：`memo` 避免直播拖着历史行重绘；直播思考/工具在上（对标 Codex 时序）；过程区间距固定，不在正文出现时再加分隔；Cursor 式可折叠 Thought（无灰卡片）；正文/内联演示在下且仅可绘时上屏；完成后「已思考 · Ns」可展开，真实工具另有过程行；完成后「已改 N 个文件」打开审查；直播秒表不在本组件计时 |
| `LiveDuration.tsx` | 直播耗时独立组件，500ms tick 只重绘秒表 |
| `TurnFlow.tsx` / `.css` | 直播过程：思考默认折叠成「思考中」（对标 Codex，避免增长正文顶回答）；连接中一行状态字+耗时（`LiveDuration`）；生成演示时改头标签；有工具才展开时间线；正文已上屏或回合结束后把过程收成「工作中 / 工作了」（对标 Codex Worked for，点开才看步骤；审批/失败仍露出）；命令输出按 `toolOutputDisplay` 截尾/折叠；正文已上屏时隐藏命令输出以免过程区顶回答；子 Agent 步骤可点开活动 |
| `ProcessTimeline.tsx` / `.css` | 旧消息回退过程时间线；子 Agent 步骤可点开活动 |
| `InlineApproval.tsx` / `.css` | 过程内高危操作审批块；出现时 view-enter + 呼吸；参数长行换行以免横向撑开直播柱 |
| `ThinkingIndicator.tsx` / `.css` | 兼容旧路径的轻量「思考中」；直播主路径用 TurnFlow 状态行 |
| `MarkdownBody.tsx` | Markdown 渲染；代码/diff 分流；本地文件引用点开右侧预览；保住 GFM 任务列表 class；元素子节点不套 span，避免收束跳动 |
| `StreamingMarkdown.tsx` | 直播正文：`React.memo` + 增量拆分复用已闭合块，只重绘增长尾部；CRLF 按 LF 拆；未闭合围栏用 `LiveFenceTail`（开闭至少三连，更长围栏可包住内部 \`\`\`）；散文尾廉价 ATX/Setext 标题（含行尾 `#`）/列表（含 `1)`、`ol start`、缩进嵌套、续行硬换行与松散 `li>p`、项内表格 / 围栏 / 引用 / ATX / Setext / HR / 嵌套围栏 / 围栏后后缀 / 松散项内缩进代码（嵌套层自己松））/任务项/嵌套引用（`blockquote>p`、引用围栏与懒续行含硬换行；未闭合围栏不吃懒续行）/表格对齐与单列 / 无两侧 `|` 与 `\\|` / 分隔行未到先画表/分隔线（含 `* * *`）/缩进代码/脚注区（缩进续行与多段）/http 图（含 title、`![alt][id]` 相对 dest、alt 去标记）/dest 内成对括号 / 未闭合 `](` 先画链接/未闭合 `**` / `*` / `~~` / `` ` `` / `***` / `<https://` 先画/`[![img]](url)`/多反引号代码/链接标签内强调与代码/HTML 实体/删除线套粗体（两侧无空白才画）/标记内混排与链接/下划线强调/`***` 嵌套强调/反斜杠转义/引用式链接含定义 title 与次行标题/邮箱/`www.`（不当文件芯片）/危险协议清空/硬换行与可点 http / 文件引用；全文引用定义挂到已闭合块；任务项用 GFM `contains-task-list` / `task-list-item`；`continueCheapProseBlocks` 保住已闭合项，不每 token 跑 remark |
| `FileCiteLink.tsx` / `.css` | 对话文件引用按钮，派发打开右侧预览 |
| `CodeArtifactBlock.tsx` / `.css` | 代码与命令输出编辑器外壳；`LiveFenceTail` 与收束后共用行节点（已闭合行 memo）；长行在对话柱内换行（不再 `min-width: max-content` 横向撑开直播贴底）；头栏同为语言标签 + 复制按钮位（不再写「写入中」），闭合围栏不再换一套 DOM |
| `CodeDiffBlock.tsx` / `.css` | 行级 diff；默认换行长行（对标 Codex Wrap long diff lines）；`--wrap` 把行网格收成 `minmax(0,1fr)`，不再 `max-content` 横向撑开直播柱；审查模式 hunk 暂存/还原 + 行内评论；⌘/Ctrl+单击行打开预览 |
| `CommandPalette.tsx` / `.css` | Codex 式 ⌘K / ⌘⇧P 命令面板 |
| `ShortcutsHelp.tsx` / `.css` | ⌘/ 快捷键一览 |
| `CompareBlock.tsx` / `.css` | 旧/新对比行布局 |
| `MessageActions.tsx` / `.css` | 消息复制 / 用户气泡编辑重发 / 失败重试 |
| `ModelPicker.tsx` / `.css` | 输入区按接入展开全部 knownModels；触发器与菜单均用短名；点选同时切换 provider + model；弹层关闭与 history 对齐 |
| `PlanBuildBar.tsx` / `.css` | 计划就绪后的 Build 操作栏 |
| `RightPanel.tsx` / `.css` | 右侧可调宽面板（文件/审查/终端/浏览器/活动）；审查传入 `gitBranchPrefix` 与 `/review` 对比焦点；文件树传入对话引用预览与项目附加文件夹；终端划选可旁路提问；全屏时隐藏下层防叠字；`right-panel--compact` 抽屉 + 遮罩 enter/exit（遮罩自带 motion token，不依赖 panel 变量） |
| `InlineDemo.tsx` / `.css` | 对话内联演示：无外框、透明底、iframe 按内容真实底边撑高（只升不降） |
| `ProviderBrandIcon.tsx` / `.css` | 模型厂商官方标识图标（DeepSeek / xAI / OpenAI / Kimi / 智谱 / OpenCode） |
| `FeedbackDialog.tsx` / `.css` | `/feedback` 对话框（对标 Codex：分类 / 说明 / 附带会话）；只复制本机诊断，不上传 |
| `ProjectFoldersDialog.tsx` / `.css` | 编辑项目：主文件夹 + 附加文件夹（对标 Codex Edit project）；Git / AGENTS.md / Skill 仍走主路径 |
| `ErrorBoundary.tsx` | 渲染错误捕获与降级 |
| `ARCH.md` | 本层架构说明 |
