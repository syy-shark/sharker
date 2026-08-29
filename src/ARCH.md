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
| [hooks/](./hooks/ARCH.md) | 弹层动画、滑动指示器、直播 token / 回合元信息外部 store |
| [lib/](./lib/ARCH.md) | 纯前端小工具（相对时间等） |
| [constants/](./constants/ARCH.md) | 布局尺寸与断点常量 |
| [types/](./types/ARCH.md) | 仅 UI 侧类型（导航、排队 prompt） |
| [assets/](./assets/ARCH.md) | Logo 等静态图 |

## 同级文件

| 文件 | 说明 |
|------|------|
| `main.tsx` | React 入口：挂载根节点 + ErrorBoundary |
| `App.tsx` | 全局状态、发送/排队（默认忙时排队，⌘⇧Enter 反转）、流式 chunk → 片段（直播浅拷贝、flush 不二次深拷、从后往前找 active tool）、多会话 buffer 快照恢复（切回优先内存 buffer，含已完成未落盘、本轮预留助手 id）、开轮预留直播行 id 收束后 upsert 同一条；长线程 UI 只拉尾页并按字节预算瘦身，点开输出/思考再 `conversations:load-message` 补一条全文（对标 Codex #38653），发送/压缩/分叉从库取未瘦身全文、不灌当前 DOM；气泡「从此条分叉」经 `messagesThroughInclusive` 只拷到该条（含），直播未完成行拒分叉（对标 Codex lastTurnId）；`handleForkFromMessage` 稳定以免 token 重挂历史行，⌘↑ / 查找命中 / 尾页上滑只把有界 `historyHead` 与尾页分开（不 slim-all、不 prepend 更早页、空页也不把 `historyStartSeq` 置 0，直播跳顶推迟到收束），⌘F 走 `conversations:search` 不回放整段（对标 Codex #33907）；窗口内按会话记住对话柱滚动（切对话 / 离开聊天页再回来仍在原处，不落盘，对标 Codex 26.406）；收束前未排空的注入等助手行落盘后再写成用户气泡并立刻开下一轮（不重复气泡、不中途 setMessages；中止才还回排队，对标 Codex leftover pending input at task finish）；排队芯片 / Composer 注入直播中只推进当前回合，失败改排队、不 abort（对标 Codex queued chip Steer）；首轮对话 id 未落库时忙时跟进进 `heldBusyFollowUps` 暂存，对话落库 / `turn_start` 后再注入或排队，不 abort 也不丢（对标 Codex Steer / Queue）；`composerQueuedPrompts` 用 `useMemo` 合并暂存与会话队列，避免直播 token 每帧重建排队数组；旁路提问 / 插入输入框 / 关右栏 / 侧栏动作回调固定引用，进行中对话 id 用 `useMemo`，避免 16ms flush 重绘侧栏 / 顶栏 / 文件树 / 审查（对标 Codex sidebar jitter / review panel scroll jumps）；`syncLiveTurnMeta` 在路径/活动没变时复用同一对象并只写直播 store，不抬 ChatView；16ms flush 只 `publishLiveStreamUi`，不 `setStreaming` / `setLiveSegments` / `setLiveTurnMeta`，ChatView `memo` 不接收 token / 回合元信息（对标 Codex #22860）；定时任务可回到指定对话或选本地/隔离环境，忙时只排队不中止直播；`/review` 默认当前对话（官方 Inline），空命令先出范围选择器再开审，直播中排队或注入不 abort，Detached 才新开线程；忙时 `/` 与 `!` 先进队列、收束后再解析（对标 Codex Tab queue slash）；行内审查评论写入输入框跟进草稿（不自动开一轮）；可显式指定模型 / 思考档位或跟随当前；独立新对话可勾选多个项目、可用 RFC 5545 RRULE，且 `createConversation({ activate: false })` 不抢当前镜头；Scheduled 页全部 / 进行中 / 已暂停筛选与立刻跑走 `automations:run-now`；对话里可用 `manage_scheduled_task` 创建（对标 Codex Scheduled）；设置/对话切换；人格写入 system prompt；后台回合完成标未读并按 `turnNotifyMode` 弹系统通知（默认同前台不打扰）、失焦审批可通知、Dock 徽标=本机未读数；审批打开时 Enter/Esc 批准或拒绝；直播中止走 `shouldInterruptTurn`（默认 Esc，设置可改绑/解绑，IME 选词不触发）；直播中 `liveTurnMeta.changedFiles` 随写盘增长、「已改 N 个文件」芯片不收到束才挂；写完打开的预览则抬 `filePreview.token` 重读，文件树随 `changesRevision` 静默刷新（不清预览、不折叠展开）；完成后芯片打开审查；弹出窗可 Always on top；设置 → 个性化编辑 `~/.sharker/AGENTS.md`；空对话建议提示可关（先恢复进行中 / 未读 / 最近更新）；用户气泡可编辑重发（空输入 Esc+Esc 回编上一条并分叉）；`sharker://` 深链与 ⌘⌥L 复制；应用菜单动作；`/fork` 分叉到新本地线程（不复用 worktreePath）；`/fork worktree` 另建隔离 checkout；`/side [问题]` 旁路新线程并弹出窗（可立刻发送、不切走当前对话）；划选历史正文 / 文件预览 / 终端「插入输入框」把引用块接到当前草稿，「旁路提问」把摘录交给 `/side`（对标 Codex send selection to composer 与 Ask in side chat）；`/rename` `/pin` `/unread` `/usage` `/keymap` `/delete` `/theme` `/debug-config` `/compact` `/resume` `/title` `/agent`；⌘⌥O / ⌘⌥N 独立新对话（对标 Codex Quick chat）；⌘⌥⇧O 项目选择器；⌘⌥R 行内重命名；⌘⌥P 置顶；⌘⇧U 未读；⇧Esc 同时清审查队列与对话未读；⌘⇧C 复制工作目录；⌘⌥C 复制会话 ID；⌘⌥⇧C 复制对话路径（隔离 worktree 优先）；`/copy` 有代码或引用时先弹出目标再复制（对标 Codex /copy picker）；Ctrl+O 静默复制整段；⌥, / ⌥. 与输入框旁思考条升降思考档；直播中 Esc 停止（输入框菜单优先）；`/archive` `/init` `/permissions` `/memories` `/copy` `/fast` `/reasoning` `/skills`（无参打开侧栏 Skills 页） `/stop` `/approve` `/subagents`；行首 `!` 打开终端执行；⌘⇧O 新对话；`/task` 在全局工作区开无项目新对话；`/status`（含对话 ID） `/diff` `/goal`（文本即首轮提示，进度行可暂停/编辑/清除，不自动多小时循环） `/plan` 按会话切换计划模式芯片（`harness_mode` 不进直播片段） `/mcp` `/feedback`（对话框复制本机诊断，不外发） `/share`（打开时拍只读快照，脱敏后复制，不含工具 I/O，不上传） `/local` `/worktree`；思考标志只置一次；直播节流审查面板刷新；隔离目录缺失时探活并提供恢复；自动化到期进审查队列（新对话 + 隔离 worktree 后台跑）；会话线程模式（本地 / 隔离 worktree）随 conversationId 恢复，切换时交接代码；`/review` 按 `reviewDelivery`（默认独立线程，可改当前对话；`/review commit` 切到指定提交）；⌘⌥U 开关侧栏 Activity（等待回复）；工具写盘抬 `changesRevision` 刷新审查面板并收集本轮写盘路径（Last turn）；`/review` 打开审查并派发只读评审；行内审查评论回灌当前对话；主线程点开子 Agent 打开活动并选中；工作台快捷键走 `matchWorkbenchShortcut`（设置 → 键盘快捷键可改绑，空串解绑）；终端聚焦时 ⌘K 清屏而不是开命令面板（⌘⇧P 仍开）；⌘Z / ⌘⇧Z 撤销/重做归档·项目批量归档·置顶·重命名·未读（输入框内不抢系统撤销）；项目菜单「归档对话」一并归档该项目对话（进行中跳过，对标 Codex Archive chats）；⌘⌥B 开关审查面板、⌃⇧G 打开审查（⌘⇧G 只在查找栏里跳上一条）；⌃Tab / ⌃⇧Tab 切相邻对话（内置浏览器聚焦时不抢）；`/project` 打开项目选择器；⌘/ 与 `/keymap` 打开设置快捷键页；⌘⌥1–6 最近对话；命令面板可打开线程查找 / 项目选择器 / 无项目新对话 / 选择模型；Search chats 匹配标题、正文摘要与 git 分支；设置草稿不得回写 activeWorkspace；新对话不清其他会话 streamOwner，并乐观写入侧栏摘要后后台刷新；Stop 先标 cancelled 再 abort，忽略迟到 tool 进度；重试立即 seed 直播头并抬 turnGen；插队本地收口后立即派发本条；在新 turn_start 前忽略旧 abort 的迟到 done；DEV 下 `window.__sharkerDebug` 可注入真实审批/错误/直播态（injectError 兼容 string / `{message}`；`seedLiveProcess` / `injectApproval` 一次把片段与秒表写入直播 store，`clearLiveProcess` / `resetChatVisual` 清空 store），并切换页面/右栏 Tab；侧栏标题乐观更新 + 进行中标记；会话切换避免空白闪帧 |
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
