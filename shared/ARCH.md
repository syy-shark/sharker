# shared — 主进程与前端共用

## 职责

- **类型与契约**：`AppSettings`、`ChatMessage`、`StreamChunk`、IPC 常量等
- **纯逻辑**：上下文估算/压缩、过程阶段派生、diff、工作区归一化等（两侧可 import）
- **不管**：Electron IPC 注册（`electron/`）、React 组件（`src/`）、工具执行（`tools/`）

## 同级目录

（无子目录）

## 同级文件

| 文件 | 说明 |
|------|------|
| `types.ts` | 跨进程核心类型与默认设置（含 `WorkspaceItem.extraPaths` 附加文件夹、`worktreeKeepCount` / `worktreeRoot`、`uiFontScale` / `codeFont` / `codeFontScale`、`keyboardShortcuts`、`followUpBehavior` / `composerEnterBehavior`（旧 `requireModEnter`）/ `suggestedPrompts`、`reviewDelivery` / Git 文案与 force-with-lease / 分支前缀 / `toolOutputDisplay`、`turnNotifyMode` / `approvalNotify` / `preventSleepWhileRunning` / `popoutAlwaysOnTop`、`memoriesEnabled`（官方默认关）与注入/写入开关、`resultOutputDeferred` / `contentDeferred` / `thinkingPreviewDeferred` 启动窗占位） |
| `ipc.ts` | IPC channel 名称常量（含永久 worktree / 归档清理 / MCP 状态与设置页增删开关 Restart / AGENTS.md 初始化 / 记忆列表 / worktree 探活 / `/approve` 重试 / 对话元数据补丁 / 清未读 / 后台回合通知与 Dock 徽标 / 弹出窗 Always on top / `sharker://` 深链与应用菜单 / 按会话计划模式读写 / 对话渲染图复制与另存 / 集成终端绑定与激活 / `GIT_INIT` 审查建仓 / `chat:steer` 注入当前回合 / `conversations:load` 可 `tail` / `slim` / `conversations:load-older` 上滑取更早页 / `conversations:load-message` 点开再取完整消息 / `conversations:search` 分页查找 / `conversations:load-range` 给 ⌘↑ 头页 / 查找命中揭开有界一段 / `automations:run-now` 立刻跑定时任务） |
| `workspace.ts` | 工作区列表、排序、设置归一化（含 `WorkspaceItem.extraPaths`、`followUpBehavior` / `composerEnterBehavior` / `suggestedPrompts` / `reviewDelivery` / Git 文案模板 / force-with-lease / 分支前缀 / `toolOutputDisplay` / `worktreeRoot` / `codeFont` / `codeFontScale` / `turnNotifyMode` / 防休眠 / 弹出置顶、`memoriesEnabled === true` 才开记忆）、全局工作区、⌘⌥⇧O 项目选择器过滤 |
| `workspace-folders.ts` | 项目附加文件夹：只收绝对路径、去重、不与主路径相同；`promoteExtraFolderToPrimary` 把附加夹升为主夹并把旧主夹留下（对标 Codex Edit project Make primary）；审查只把其中不同 Git 仓库收进选择器 |
| `workspace-folders.test.ts` | 拒绝 `/` / 相对 / `..` / 主路径重复；附加夹升为主夹后旧主路径进附加列表 |
| `review-repos.ts` | 跨仓库审查：探根、同仓去重、本轮固定 All repos（对标 Codex Last turn 看附加仓全部改动，选择器不再落到单仓）、附加根文件用目录名前缀打开、多文件 diff 展开键（对标 Codex Review changes across repositories / expand or collapse all diffs）；`lastTurnPendingRelPaths` 列出预览已点名、git status 还没见到的路径（不编造 diff）；`sortReviewFilesLikeFileTree` 与文件树同序（目录先于文件、localeCompare，对标 Codex review diff ordering） |
| `review-repos.test.ts` | 同仓子目录合并、本轮固定 All repos（选中单仓也不改）、附加根路径匹配、本轮预览未落盘路径、多文件 diff 展开键；审查列表按文件树排序 |
| `workspace-tree.ts` | 工作区文件树节点（右侧面板 IPC）；有附加文件夹时 `wrapWorkspaceForest` / `buildWorkspaceForest` 把主根与附加根都做成顶层节点；`@` 搜索可扫附加文件夹（目录名做前缀） |
| `workspace-tree.test.ts` | 无附加时平铺主树；有附加时主根与附加根并列 |
| `conversation.ts` | 对话模型、标题推导、侧栏排序（置顶优先）、Search chats 扩匹配（标题 / 正文摘要 / git 分支；官方默认不绑 ⌘G）、对话路径、进行中任务拆分、⌘⌥A 先等审批再进行中、侧栏 Chronological / 进行中 / 等待回复 / 未读 / 定时 / 置顶筛选、⌘⌥U 开关 Activity、项目菜单「归档对话」只收该项目未归档 id（可跳过进行中）、`/fork` 分叉标题与拷贝、`messagesThroughInclusive` / `canForkThroughMessage`（对标 Codex `thread/fork` `lastTurnId`，直播未完成行拒分叉）、`/fork [local|worktree]` 目标、`/rename` `/pin` 未读；`historyStartSeq` / `historyTotal` 给长线程尾页 |
| `conversation.test.ts` | 按标题 / 自定义标题 / id / 正文 / 分支过滤、进行中拆分、分叉标题与 `/fork` 目标、按消息截断拷贝、置顶排序、`/rename` |
| `workspace.test.ts` | 项目选择器按显示名 / 路径 / id 过滤；附加文件夹归一化 |
| `worktree-include.ts` | `.worktreeinclude` 解析 / 匹配、worktree 起点校验 |
| `worktree-include.test.ts` | 模式解析、glob、拒绝非法 baseRef |
| `worktree-root.ts` | Settings → Worktrees 根目录：只收绝对路径，空/非法回退默认 |
| `worktree-root.test.ts` | 绝对路径保留、相对/`..`/`/` 丢弃 |
| `needs-tools.ts` | 寒暄是否跳过 tools；续跑短句保留 tools |
| `context-limit.ts` | 各模型 context 上限与格式化 |
| `context-compress.ts` | 85% 阈值自动压缩历史 |
| `token-estimate.ts` | 上下文 token 粗估 |
| `token-usage-store.ts` | 每日 Token 消耗（蓝点热力图数据） |
| `token-usage-format.ts` | `/usage daily|weekly|cumulative` 文案；设置 → 用量的终身 / 峰值 / 连续活跃汇总与火花图比例 |
| `token-usage-format.test.ts` | 用量窗口、洞察汇总与火花图比例 |
| `process-steps.ts` | 旧消息回退：过程时间线步骤（含子 Agent 点开 id） |
| `live-stream-ui.ts` | 直播 token 快照：`nextLiveStreamUi` 字段没变则复用对象，给 ChatView 外部 store（对标 Codex #22860，16ms flush 不抬历史列） |
| `live-stream-slices.ts` | 直播过程/回答切片：正文增长且工具引用没变时过程视图退回 prev；回答拆闭合块与增长尾；操作条只订布尔（对标 Codex #22860） |
| `live-stream-ui.test.ts` | 相同片段引用与正文不换对象；增长才换；过程切片与闭合回答在 token 增长时复用 |
| `live-display.ts` | 直播头标签/合成「规划下一步」只关思考占位、不把头闪成规划（对标 Codex flashing thinking summaries）；思考正文（去尾部 CSS）/演示可绘判断与首帧估高缓存，与 TurnFlow / InlineDemo 共用；`isNearLiveMessageRow` 标贴底窗口（不用 nth-last-child）；离开窗口后 `nextRowIntrinsicHeights` / `resolveRowIntrinsicHeight` / `rowIntrinsicSizeStyle` 用实测高度当 content-visibility 内在尺寸（第一帧不走 160px 估高）；`shouldForceStickScroll` 收束时只有真贴底才强制滚；`shouldFollowApprovalIntoView` 审批出现时读历史不抢镜头（对标 Codex #38220 / #37849）；`shouldMarkUnseenLive` / `jumpToBottomAffordance` 读历史时直播长高只换「新消息」芯片（ChatView 在 composer-stage 流里占位，对标 Codex #38220 new message / #40788，不改 scrollTop、不盖直播尾）；`liveStickScrollTop` / `liveStickNeedsFollow` 在内容变高或输入框挤矮视口时跟贴底（ChatView 同时盯 `composer-stage`，对标 Codex #40788）；`shouldMountMessageActions` / `shouldReserveMessageActions` 在正文槽上屏就占操作条；`LIVE_TAIL_SAFE_PX` 给对话柱尾留空，避免操作条被输入区阴影盖住（对标 Codex #40788 / #41155）；`shouldFollowArtifactTail` 给代码/diff 内层滚动跟尾（外壳 max-height 后新行不再顶对话柱，对标 Codex #32030 / #38695）；`continueLiveFenceLines` / `nextClosedFenceLines` 已完成围栏行退回同一引用（对标 Codex #39061 / #22860）；`transcriptNavIntent` 认 ⌘↑⌘↓ / Home / End 跳对话顶底（对标 Codex #39181，输入框与右侧预览不抢）；`shouldFocusTranscriptScroller` / `shouldLockStickOnTranscriptKey` 让点对话柱后方向键 / Page / Space 原生滚动且上翻锁贴底（对标 Codex 桌面 #39851）；`formatElapsedClock` / `ELAPSED_CLOCK_RESERVE_CH` 给 Goal / 长回合秒表预留「1h 59m」；`shouldFoldTurnWork` 在正文上屏后收成 Worked for；`shouldCollapseProcessOnAnswerStart` 在回答刚出现时收回用户展开的 Thought / Worked for；`sameRefList` 在回答 token 增长时保住过程数组引用 |
| `streaming-markdown.ts` | 流式 Markdown 拆成稳定块 + 尾部；`streamingProseText` 给直播整段廉价散文（围栏前缀）；`extractClosedFenceParts` 抽出已闭合围栏正文供顶层槽复用；`streamingRenderSlots` 已收散文按 `prose-${id}` 成闭合槽、增长尾固定 `prose-run-0`（空行收段不换尾 key，文末单独换行不收段（表行留在同一增长尾），已画段不跟 token 重解析）；`continueStreamingRenderSlots` 按 key 复用已闭合槽对象；`nextLinkDefinitions` / `nextCheapProseClosed` 在定义行与已闭合块没变时退回同一引用（对标 Codex #22860）；`needsFullRemarkMarkdown` 恒为 false（脚注已廉价画，收束不换 remark）；CRLF 归一（`normalizeStreamingText` 也给用户气泡 / 排队条，对标 Codex #38704）；`continueStreamingMarkdown` 复用已闭合块；`finalizeStreamingMarkdownSplit` 收束时只把尾收成稳定块；围栏开闭按最长 \`/\~ 串（\`\`\`\` 可包住内部 \`\`\`）；散文尾廉价块（ATX/Setext 含 0–3 空格与行尾闭合 `#`、列表含 `1)` / `ol start`、缩进嵌套、续行硬换行与松散 `li>p`、项内表格 / 围栏 / 引用 / ATX / Setext / HR / 嵌套围栏 / 围栏 / 标题 / HR / 表后后缀（项内表不把无 `|` 续行吃进表；标题 / 围栏后的表行另起项内表；闭合并栏后再起表 / 标题 / 引用 / 段落时围栏不动；缩进代码后的标题不并进 pre） / 松散项内缩进代码（嵌套层自己松、不松外层）/`blockquote>p`/引用懒续行（含硬换行；未闭合围栏不吃懒续行；懒续行不抽表格）/表格对齐与单列 / 无两侧 `|` 与 `\\|` / 分隔行未到的两侧 `|` 行先画表/分隔线含 `* * *`/缩进代码/引用围栏/`pre` 语言/脚注区含缩进续行与多段、无引用的定义不画）与行内（闭合链接含空 dest / `#锚点` / 相对路径 / 危险协议清空 / 未闭合 `](` 先画链接避免收束跳、dest 内成对括号与标签内换行、`[![img]](url)`、标签内 `**` / `` ` ``、多反引号代码、引用式链接 / 引用式图片含相对 dest 与定义 title 与次行标题、HTML 实体、`<https>` / 邮箱 / `www.`、http 图（含 title、alt 去标记）、下划线强调、`***`/`___` 嵌套强调、`~~** **~~` 删除线套粗体、标记内混排 / 链接 / 代码、未闭合 `**` / `*` / `~~` / `~` / `` ` `` / `***` / `<https://` 先画（空 opener 与 GFM `~~ not` / `~ not` 仍留原文）、完整 `<!-- -->` 不画、GFM 单 `~` 删除线（对标 remark-gfm `singleTilde`）、反斜杠转义、GFM 删除线（两侧无空白）、脚注、硬换行、文件引用）；`[` 对不上 `](` 时不吞后续标记；链接定义行不画；`continueCheapProseBlocks` 最后一块（含段落软换行、嵌套项内引用 / 围栏、围栏 / 标题 / HR / 表闭合后的项后缀、引用内围栏闭合后的后续段、缩进代码 / 脚注续行 / 引用内换行后的列表项、围栏 / 表 / 列表 / 引用 / 段落后的增长段）只重解析增长段，前面的标题/段落保持同一引用（对标 Codex #39061 / #34045），复用已闭合列表项/嵌套项/表格行（新表行不换已画表头 / 旧行 cells 引用），中间块类型变了也保住后面已闭合块；`cheapInlineNodeKeys` 用类型+前缀长度；`cheapProseBlockKeys` 按类型计数以免中间块改类型换后面节点；`matchLiveTaskMarker` 在 `[x` / `[ ]` 未写完时先占 checkbox（`[x](url)` 仍当链接）；未写完的表格分隔 `|` / `|:` 不当数据行；无两侧 `|` 的表头在打 `---` 时不升成 Setext 标题，正文行未写 `|` 也先留在表里；Setext 下划线不到三连先保持段落；未写完的列表标记 `-` / `1.` 不并进上一项；无 `]:` / `[^` 不扫引用与脚注定义 |
| `streaming-markdown.test.ts` | 流式拆分：段落收束、未闭合围栏（含 0–3 空格）、稳定 id、增量复用、收束尾块不拆已闭合对象、廉价行内（含 http 图 / 引用式图片含相对 dest / dest 内括号 / 空 dest / `#锚点` / 相对路径 / 危险协议清空 / `[![img]](url)` / 多反引号代码 / 链接标签内强调 / HTML 实体 / 删除线套粗体 / 标记内混排与链接 / 图片 alt 去标记 / 下划线 / `***` 嵌套强调 / 未闭合 `**` / `*` / `~~` / `~` / `` ` `` / `***` / `<https://` 先画 / 单 `~` 删除线 / HTML 注释不画 / 引用链接含 title / 邮箱 / `www.` / 脚注续行 / 硬换行）与标题（含 Setext / 0–3 空格 / 行尾 `#`）列表（`1)` / `ol start`、嵌套、续行硬换行、松散、项内引用 / ATX / Setext / HR / 嵌套围栏 / 缩进代码）/表格（含单列、无两侧 `|` 与 `\\|`）/ `* * *` 分隔线 / 引用围栏与懒续行（不吃未闭合围栏、不抽懒表格） / 缩进代码 / 中间块变 table 后标题与列表仍是同一对象且块 key 不变 / 行内 key 闭合后前缀不变 / `matchLiveTaskMarker` 认未写完勾选、不认 `[x](url)` / 未写完表格分隔不当行 / 无两侧 `|` 表头打 `---` 不升 Setext / 未写完列表标记不并进上一项 / `extractClosedFenceParts` 抽已闭合围栏正文 / `streamingRenderSlots` 空行后已收段是 `prose-md-N`、增长尾仍是 `prose-run-0`、文末换行不把表行拆成多槽、围栏仍是 `live-fence-N` / `continueStreamingRenderSlots` 按 key 复用已闭合槽 / `nextLinkDefinitions` blob 不变退回同一 Map / `nextCheapProseClosed` 尾增长退回同一 closed 数组 / 长列表末项与长表末行增长仍复用已画项/行 / `# 标题` / 段落后列表或标题增长时前缀对象不变 / 段落软换行后续写时行内前缀不变 / 缩进代码只改正文 / 嵌套项内引用 / 围栏、围栏 / 标题 / HR / 表闭合后的项后缀、引用内围栏闭合后的后续段与脚注续行、引用内换行后新列表项、围栏 / 表 / 列表 / 引用 / 段落后增长段、闭合并栏后再起后续块时前缀对象不变 / 脚注也不换 remark |
| `file-citation.ts` | Codex 式文件引用：`path:line` / `#L` / `(line N)`、相对路径接到工作区或附加根（目录名前缀）；拒绝 `www.`、`</tag>` 与尾斜杠 / `a\\` 假路径，以免直播把自动链接 / HTML / 反斜杠硬换行收束成文件芯片 |
| `mermaid-fence.ts` | ```mermaid / ```mmd 围栏判定（直播 `mer` 起就认，不认 `md` / `mm`）；开闭都挂 MermaidBlock，只在闭合后画图；按主题缓存 SVG，避免重挂闪回源码；从 viewBox / 宽高解析固有尺寸；成图前按节点/边/行数估高并做高水位占位，避免代码尾换 SVG 跳贴底；解析失败仍留同一外壳 |
| `mermaid-fence.test.ts` | 认 mermaid / mmd / 直播 `mer` 前缀，拒绝 js / diff / `md`；SVG 缓存按主题隔离并 LRU 淘汰；viewBox / px 尺寸、忽略百分宽高；估高 / 高度缓存 / 成图槽取高 |
| `chat-image.ts` | 对话渲染图导出：安全文件名、只认附件路径 / http(s) / `data:image`（对标 Codex Save or copy rendered images）；工作区相对路径图接到工作区 / 附加根（不认 `file://`）；按 src 缓存固有宽高与 data URL；`peekChatImageSizeFromDataUrl` 从 PNG/JPEG/GIF/WebP/BMP 头读尺寸，直播首帧按比例占位，未测到前 48px 高水位，`liveChatImageMinHeight` 成图后只升不降（不再用 8rem / 小图塌贴底） |
| `chat-image.test.ts` | 文件名清洗、拒绝 `javascript:` / `file://`、工作区相对路径解析、尺寸 / data URL 缓存、PNG 头窥尺寸与占位高 |
| `file-citation.test.ts` | 行号后缀、拒绝 URL / `www.` / `</tag>` / 尾斜杠 / `a\\`、边界匹配、附加根前缀 |
| `git-change-diff.ts` | 工作区新旧文本 → 审查用 FileDiff |
| `git-change-diff.test.ts` | 新增 / 删除 / 修改三种 git 变更 diff |
| `git-status.ts` | porcelain 行解析：暂存 / 未暂存 / 未跟踪；`parseGitNumstat` 给审查选择器 +/- |
| `git-status.test.ts` | porcelain XY / 重命名 / 未跟踪 / numstat |
| `git-review-actions.ts` | 审查动作：暂存、取消暂存、还原（路径锁工作区） |
| `git-review-actions.test.ts` | 临时仓库验证 stage / unstage / revert |
| `at-mention.ts` | Composer `@` 查询解析与插入 |
| `at-mention.test.ts` | `@` 边界与路径插入 |
| `chat-mention.ts` | Composer `@chat/<id>`：过滤其它线程、有界摘要 |
| `chat-mention.test.ts` | 解析 id、排除当前线程、截断摘要 |
| `workbench-shortcuts.ts` | 默认工作台快捷键与 `SHORTCUT_CATALOG`（设置页改绑；含 ⌘J 开关工作区面板、Ctrl+` 打开终端（对标 Codex Toggle bottom panel / Toggle terminal）、Search chats 默认不绑、⌘G 留给 Find next（审查聚焦时走审查 diff）、⌘⌥U 活动视图、⌘⌥⇧U 子 Agent、⌘⌥O / ⌘⌥N 独立新对话、⌘⌥⇧O 项目选择器、⌘⌥⇧C 对话路径、⌘Z / ⌘⇧Z / Ctrl+Y 应用撤销重做、小键盘字号、⌘⌥B 开关审查面板、⌃⇧G 打开审查（对标 Codex Toggle review panel / Open review tab）、⌃⇧M 打开模型选择（对标 Codex Open model picker，不认 ⌘⇧M）、⌃Tab / ⌃⇧Tab 切对话、Esc 停止当前回合可改绑；帮助表含输入框 Shift+Tab 切计划（不进全局和弦）、⌘↑⌘↓ / Home / End 跳对话顶底、点对话柱后 ↑↓ / Page / Space 滚动、⌘F 对话或审查查找；浏览器聚焦 ⌘R / ⌘⇧R 刷新 / 无缓存刷新；终端聚焦 ⌘K 清屏判定） |
| `workbench-shortcuts.test.ts` | 默认和弦，含 ⌘J 开关面板 / Ctrl+` 终端、⌘G / ⌘⇧G 不绑 Search chats、⌘⌥U 活动视图 / ⌘⌥⇧U 子 Agent、⌘⌥O / ⌘⌥N 独立新对话、⌘⌥1–6 / ⌘⌥← / ⌘⌥⇧O / ⌘⌥⇧C / ⌘Z / Ctrl+Y / Numpad / ⌘⌥B 开关审查 / ⌃⇧G 打开审查（⌘⇧G 不打开审查）、⌃⇧M 打开模型选择（⌘⇧M 不打开）、⌃Tab / ⌃⇧Tab |
| `app-undo.ts` | 应用操作撤销栈（归档 / 项目批量归档 / 置顶 / 重命名 / 未读）；输入框 / 浏览器 / 终端不拦截 |
| `app-undo.test.ts` | 撤销/重做栈与上限 |
| `keymap.ts` | 用户覆盖：编码和弦、先覆盖后默认、空串解绑；`shouldInterruptTurn` 默认裸 Esc（可改绑 / 解绑；IME 选词与 keyCode 229 不触发）；F1–F24 可单独成键（对标 Codex `interrupt_turn = "f12"`） |
| `keymap.test.ts` | 改绑后默认失效 |
| `debug-config.ts` | `/debug-config` 本机设置摘要（不含 Key；记忆行含功能总开关） |
| `debug-config.test.ts` | 密钥打码 |
| `panel-width.ts` | 右侧面板宽度按窗口比例记忆（对标 Codex percentage-based file tree resizing）；旧像素值仍能读 |
| `panel-width.test.ts` | 夹取、比例还原、兼容旧像素 |
| `ui-font-scale.ts` | 界面字号档位：0.85–1.35、0.05 步进 |
| `code-font.ts` | 代码字体白名单与 `--mono` 栈（对标 Codex Code font） |
| `code-font.test.ts` | 未知值回退 system、别名与栈含 monospace |
| `ui-font-scale.test.ts` | 夹取、步进、百分数 |
| `nav-history.ts` | 工作台前进 / 后退栈（最多 40 落点）；鼠标侧键 3/4；含 `skills` 页 |
| `nav-history.test.ts` | 前进栈丢弃、往返 |
| `review-prompt.ts` | `/review` 未提交 / 基线 / 指定 commit 提示词；空参数先出范围选择器（`reviewNeedsScopePicker`）；Review delivery 默认 inline（官方当前对话）与 here/detached 覆盖；`reviewSubmitMode` 直播中排队/注入不 abort；剩余参数作自定义关注（对标 Codex `/review Focus on …`） |
| `git-prompt.ts` | Settings → Git 的 commit / PR 文案模板、分支前缀与 force-with-lease：截断、拼 system 段、接到 `git-commit` skill |
| `diff-hunk.ts` | FileDiff 拆 hunk + unified patch |
| `diff-hunk.test.ts` | 远距变更拆成两块、patch 头 |
| `git-hunk-actions.ts` | hunk 级 `git apply` 暂存 / 还原 |
| `git-hunk-actions.test.ts` | 只暂存第一个 hunk |
| `git-commit.ts` | 审查面板提交已暂存 / 推送当前分支（可选 `--force-with-lease`） |
| `git-commit.test.ts` | 只提交暂存、拒绝空说明、无远程推送失败、`gitPushArgs` |
| `git-compare.ts` | 相对基线分支 / 指定 commit 的 name-status + 本轮路径匹配 |
| `git-compare.test.ts` | 重命名解析、本轮命中、feature 相对 main、commit name-status |
| `commit-review.test.ts` | `/review commit` 解析与 git log 行 |
| `git-pr.ts` | `gh pr create` 标题校验与 URL 解析 |
| `git-pr.test.ts` | 拒绝 flag 标题、解析 URL、缺 gh 报错 |
| `git-pr-context.ts` | 当前分支 PR + GitHub 行内评论（`gh pr view` / `gh api`）；顶栏芯片文案 |
| `git-pr-context.test.ts` | 解析 PR JSON、LEFT→old、缺 gh |
| `git-pr-review.ts` | 本地行内评论写回 GitHub PR |
| `git-pr-review.test.ts` | 跳过 gh- 导入评论、拼 api 参数 |
| `thread-window.ts` | 弹出线程窗 `#thread/<ws>/<id>` |
| `thread-window.test.ts` | hash 往返 |
| `subagent.ts` | 子 Agent 快照过滤 / 排序 / 主线程解析 id / 落盘中断（不进侧栏） |
| `subagent.test.ts` | 按父线程过滤、进行中优先、解析 spawn id、重启中断 |
| `git-init.ts` | 审查面板：项目还不是仓库时 `git init -b main`（对标 Codex Review create a repository） |
| `git-init.test.ts` | 空/根路径拒绝；临时目录建仓后拒绝二次 init |
| `file-preview.ts` | 右侧预览种类：图 / PDF / 文本；xlsx 等办公二进制不假装表格；`parseGoToLineInput` / `maxDiffGotoLine` 给预览与审查 ⌘L 跳行；`previewPathTouchedByWrites` 判断打开的预览是否被本轮写盘碰到；`fileTreeReloadMode` 区分换工作区与写盘静默重拉树；`shouldAnimateFileTreeInsert` 定居后不再播进入动画（对标 Codex sidebar jitter） |
| `file-preview.test.ts` | 扩展名分流、MIME、跳行夹取与 diff 行号上限、写盘路径是否碰到预览、写盘重拉树不清预览 |
| `git-branch-create.ts` | detached HEAD 上创建命名分支；可选 Settings 前缀 |
| `git-branch-create.test.ts` | 拒绝非法名、前缀校验、临时仓库 checkout -b |
| `settings-git-policy.test.ts` | force-with-lease 参数与分支前缀纯函数 |
| `tool-output-display.ts` | 对话命令输出 brief / standard / verbose：截尾、是否默认展开；直播中不挂「查看输出」/ 退出码 / 结果摘要 / 秒表心跳 detail、也不自动展开 verbose（对标 Codex command output behind expand / #19260） |
| `tool-output-display.test.ts` | 默认 standard、brief 隐藏、verbose 完成后展开、直播中不挂详情 / 退出码 / 进度摘要 / 秒表心跳 detail |
| `git-handoff.ts` | 本地 ↔ worktree 交接：快进/合并 HEAD 并拷脏文件 |
| `git-handoff.test.ts` | 脏文件拷到干净本地、拒绝脏目标 |
| `thread-search.ts` | 线程内查找（大小写不敏感；一句话多处各算一次）；分页线程盘上命中与内存/直播命中合并（对标 Codex #33907，不回放整段）；`appendLiveFindHits` 把直播命中接在历史后面且空直播不换历史数组；`findHitMessageIds` 给历史行高亮；`seedFindQuery` 把划选收成查找词；`locateFlatRange` 给可见文本高亮；`escapeLikePattern` 给 ILIKE |
| `thread-search.test.ts` | 命中消息 id 与多处偏移；划选预填去空白并截断；审查 diff 查找命中 / 空查询 / 高亮切片；盘上命中与内存合并、ILIKE 转义 |
| `review-diff-search.ts` | 审查 diff 跨文件查找：`findInReviewDiffs` 按 `FileDiff.lines` 偏移命中；审查聚焦时 ⌘F / ⌘G 走审查而不是线程（对标 Codex review search / Cmd+F starts with selection）；`splitFindHighlights` 给行内高亮 |
| `terminal-tabs.ts` | 集成终端按线程分标签：标题、上限 8、关最后一张不准、最近 6 条线程缓存；pending 窗格可收成对话 id |
| `terminal-tabs.test.ts` | 新建 / 关闭 / 线程 key / 缓存淘汰 / pending 收编 |
| `terminal-snapshot.ts` | 集成终端快照：去 ANSI、环形缓冲、`read_thread_terminal` 文案 |
| `terminal-snapshot.test.ts` | 去色、截尾、无会话提示 |
| `review-comment.ts` | 行内评论 → 跟进草稿（用户自己发送，不自动开一轮）；解析 `/review` 的 `review-findings` 围栏 |
| `review-comment.test.ts` | 评论锚定路径与行号、围栏/标题解析 |
| `review-file-click.ts` | 审查文件名打开预览、行背景展开/收起、⌘单击行跳预览；右键菜单「打开预览 / 展开 diff」（对标 Codex review file tree open menu） |
| `review-file-click.test.ts` | 文件名 vs 背景、修饰键开行、菜单项与菜单位置夹取 |
| `skill-mention.ts` | Composer `$` Skill 引用解析与插入；`@` 菜单插入 `$name`；发送前收集 / 撤掉已绑定 Skill |
| `skill-mention.test.ts` | `$token` 边界与过滤、`@` 插入、绑定芯片 |
| `command-palette.ts` | ⌘K 命令面板目录（含查找、搜索对话、听写、语音、弹出窗、分叉 / 分叉到隔离 worktree、旁路、归档、归档当前项目对话、重命名、置顶、未读、独立新对话、无项目 `/task`、选择模型、项目选择器、打开用量、打开通用 / 个性化 / 通知 / 建议提示 / MCP 服务器、复制工作目录 / 会话 ID / 对话路径 / 对话深链、撤销/重做应用操作、初始化 AGENTS.md、权限、本对话记忆、状态、目标、打开 worktree、前进后退、字号、开关工作区面板、清终端、分享只读快照） |
| `command-palette.test.ts` | 命令过滤 |
| `workspace-search.test.ts` | `@` 文件命中排序 |
| `process-phases.ts` | 过程阶段/步骤派生；读/列/改标题附目标末段；命令标题优先 `toolArgs` 且保留 shell 短选项/下划线；进度心跳不进直播/完成态 detail（只留预留宽秒表）；标题已含 path/command 时直播中也不重复 detail；仅 kind=tool 且 done 的命令计入 totals（status 桥接/cancelled 不计）；直播派生从后往前扫、不拷数组；`reuseProcessPhaseSteps` 保住已完成步骤对象（片段被浅拷但展示字段相同也复用） |
| `process-phases.test.ts` | 思考原文不当标题；已完成步骤在后续工具增长或片段浅拷后仍是同一对象 |
| `turn-segments.ts` | 流式 chunk → 有序 `TurnSegment[]` 状态机；token/think / status / 写入预览 / 收束都只换数组和改过的段（已完成工具保持引用，避免心跳打穿过程行 memo）；`cloneSegments` 只给会话缓冲隔离用；`extractFinalContent` / `findLastSegment` / 直播摘要从后往前扫、不拷数组；`tool_start` 保留 `toolArgs`；写入/补丁 `tool_preview` 先占同一 tool 段与 `s.id-diff-N`（`isWritePreviewTool`），参数流把已解析的 +/- 填进同一槽（对标 Codex 约 0.5s 逐文件 diff），`tool_start` / `tool_done` 合并不换 id；`finalizeSegments` 将未完成工具标为 `cancelled`；`hasProcessFlow` 完成后不计 `present_inline_demo` / 空过程；`buildAnswerParts` 写入一开始用 `editPreview` 占 `s.id-diff-N`，完成后填 `fileDiff`；`reuseAnswerParts` 在预览 token / 元信息刷新时保住已闭合文字与 diff 对象；正文 ```demo 开闭都拆成 `s.id` / `s.id-demo-stream` / `s.id-post`（直播未写完 `dem` / `viz` 就占槽，不认 ```diff / ```html / ```vim），收束不把演示搬回 Markdown 重挂 |
| `turn-segments.test.ts` | turn-segments / phases / token 不改旧对象；status 心跳 / 写入预览 / 收束也不换已完成工具引用；```demo 半截 `dem` 就占 `demo-stream`，开闭保持 `s.id` / `demo-stream` / `-post`；写入 `tool_preview` 先占槽再填 +/-，`tool_start` / `tool_done` 同一 `s.id-diff-N`；相同预览再派生不换 answer part |
| `thread-goal.ts` | `/goal` 解析（含官方 `edit`）、暂停/清除、4000 字上限、system 注入块、进度行状态字与 `startedAt`；`shouldStartGoalTurn` 只对设定文本开首轮 |
| `thread-goal.test.ts` | 设定 / 编辑 / 暂停 / 芯片文案 / 首轮是否发起 |
| `thread-status.ts` | `/status` Markdown 快照（对话 ID / 模型 / 权限 / 上下文 / 本机今日用量） |
| `thread-status.test.ts` | 本地隐藏 worktree、隔离显示路径、今日用量 |
| `worktree-prune.ts` | 托管 worktree 保留最近 15 个、受保护不删、永久名称清洗 |
| `worktree-prune.test.ts` | 保留最新、保护路径、目录名 |
| `live-process.test.ts` | 直播过程 seed / 审批等待 / 工具状态回写 / 工具间隙规划 单测 |
| `approval-session.ts` | 审批 once/session/deny 纯逻辑与会话授权表；拒绝记录 + `/approve` 一次性放行 |
| `approval-session.test.ts` | 审批决策、会话授权、`/approve` 一次重试 |
| `pending-steer.ts` | 当前回合注入信箱纯逻辑（对标 Codex Steer）：按会话排队、首轮采样前不排空、排空后写入用户气泡且同 id 不重复；收束残留成功则 consume、中止/未采样则 restore，且 `appendFinishLeftoverSteers` 等助手行落盘后再写（对标 leftover pending input at task finish，不中途 `setMessages`）；排队芯片直播中主操作是注入（`queuedChipPrimaryAction`）；忙时注入失败改排队（`resolveBusyFollowUp`），只有没有进行中回合才新开，不 abort 直播；首轮对话 id 未落库时 `holdBusyFollowUp` 暂存 Steer/Queue（`resolveBusyFollowUpWithoutConversation`），冲进时 `applyHeldBusyFollowUp` 在 `turn_start` 前对 `no_active_turn` 只 retry 不 abort |
| `pending-steer.test.ts` | 会话隔离、采样前不排空、排空 / 改写 / 取消、历史去重、收束残留 disposition / 收束后再写入、无会话 id 暂存与冲进 retry |
| `transcript-scroll.ts` | 对话柱滚动快照：贴底跟到底、读历史钉 scrollTop、内容未画高先按距底占位（对标 Codex 26.406 按会话记住位置；窗口内、不落盘）；快照可带 `transcriptWindowStart`；`scrollTopToCenterChild` 给查找/回编只改对话柱（不 `scrollIntoView`） |
| `transcript-scroll.test.ts` | 贴底 / 中段 / 内容变高 / 未画完推迟恢复；长线程尾窗起点与上滑揭示；启动窗瘦身与点开补水；查找居中 scrollTop |
| `transcript-window.ts` | 长线程只挂最近一段、上滑分页揭示更早消息；DOM 有挂载上限；⌘↑ / 查找命中 / 尾页上滑只算 `historyHead` 有界页（`headRangeForJumpTop` / `headRangeForFindHit` / `olderPageRangeForTail` / `nextHeadRange`），不把瘦身全文或更早页 prepend 进尾页 `messages`、空页也不把 `historyStartSeq` 置 0；直播中不取跳顶头页（`shouldFetchSlimHistoryOnJumpTop`），收束后再取（对标 Codex older history fetched as needed / 官方分页，不一次铺开、无「加载更早」按钮）；盘页合并 / 钉窗下标后移 |
| `transcript-hydrate.ts` | 打开长线程时按约 50KiB 人类可读预算瘦身：正文走快路径，过长命令输出 / 思考改占位（对标 Codex #38653）；`mergeHydratedMessage` 点开再补全文；`shouldReloadUnslimmedHistory` 判断模型/压缩/分叉要不要回库取原文（UI 尾页或瘦身占位不能当模型历史）；落盘必须跳过占位消息以免写成空壳 |
| `session-runtime.ts` | 多会话队列归属、Stop/done 门闩、commit 目标解析（纯逻辑）；held 时不自动出队；排队可编辑 / 重排 / 取出立刻发送；排队项可带定时任务的 `providerId` / `thinkingLevel`；直播行预留助手 id / 收束 upsert；直播体已空且历史已挂同一 id 时不再藏历史行、也不再画空直播行（对标 Codex preserved streamed activity when tasks complete） |
| `composer-draft.ts` | 未发送输入按会话记住（`chat:id` / `new:workspace`，最多 40 条）；切对话不串稿（对标 Codex restore unsent prompts） |
| `composer-draft.test.ts` | 键、空草稿删除、附件、最旧淘汰 |
| `composer-submit.ts` | Composer Enter/Tab：空闲发送；忙时按 `followUpBehavior` 默认排队（对标 Codex 桌面）；⌘⇧Enter 反转单条；`composerEnterBehavior`（`enter` / `cmdIfMultiline` / `cmdAlways`，旧 `requireModEnter`）决定是否要修饰键；Tab 仍排队；Shift+Tab 不排队（`isPlanModeToggleKey`，对标 Codex Best practices `/plan` 或 Shift+Tab）；审批打开时 Enter 允许一次 / Esc 拒绝；空输入 ↑ 恢复刚提交或上一条（取消运行 / 取消 worktree 创建后即使还没进对话也能恢复）；Ctrl+R 提示历史；空输入 Esc+Esc 就地回编上一条并分叉；`shouldStickAfterComposerSubmit` 只有 `'send'` 贴底（对标 Codex #13698 / #38220，排队/注入不拽阅读位置）；`shouldQueueComposerSlash` 让忙时 `/` 与 `!` 先排队、收束后再解析（对标 Codex Tab queue slash） |
| `composer-submit.test.ts` | Enter/Tab 与菜单/换行、默认排队、⌘⇧Enter 反转、⌘Enter 发送、Shift+Tab 切计划不排队、审批热键、恢复上一条 / 刚提交草稿、空输入 Esc+Esc 回编、只有 send 贴底 |
| `pending-preview.ts` | 注入/排队芯片预览截到 3 行 / 240 字（对标 Codex #39864 pending input wrapping），避免长文折行把对话柱挤矮（#40788） |
| `pending-preview.test.ts` | 短文不截、多行与超长加省略号、CRLF 归一 |
| `secret-redact.ts` | 已知 API Key / token / PEM / Bearer 形态换成 `[REDACTED:…]`（对标 Codex Share redacts known secret patterns） |
| `secret-redact.test.ts` | 常见令牌脱敏、普通路径留下 |
| `thread-snapshot.ts` | `/share` 只读快照：用户可见消息、思考摘要、改文件 diff；不含工具 I/O；打开时拍一帧；脱敏后复制，不上传 |
| `thread-snapshot.test.ts` | 收录用户/回答/diff/直播可见段，丢掉 shell 输出，脱敏 Key |
| `suggested-prompts.ts` | 空对话建议：先恢复进行中 / 未读 / 最近更新的对话，再审查 / 目标（对标 Codex Settings → Suggested prompts；不对创建时间排队） |
| `suggested-prompts.test.ts` | 无工作区为空、有目标时跳过 goal 芯片；恢复优先进行中与最近 `updatedAt` |
| `composer-paste.ts` | 粘贴决策：text/plain（及 HTML 剥标签）优先于图片；CRLF 归一；超长收成 `Pasted text.txt`；空输入 / 空参斜杠折进正文 |
| `composer-paste.test.ts` | Word 双层剪贴板走文本、`/goal` 吃粘贴附件 |
| `turn-notify.ts` | 后台回合：系统通知档 never/background/always、批准通知、未读、Dock 徽标、改文件数正文与芯片文案 |
| `turn-notify.test.ts` | 失焦通知、never/always、批准通知、同会话不标未读、徽标计数、改文件文案 |
| `deeplink.ts` | `sharker://` 解析：新对话 / 打开线程 / 设置（含 notifications/notify→通知、code-font→外观、general/review→通用、personalization/personality/memories→个性化、mcp/mcp-servers→MCP 服务器、suggested-prompts/suggested/prompts→建议提示、git/worktrees→权限、usage/profile/tokens→用量） / Skills / 自动化（打开创建流）；不解析 plugins、pets、SSH |
| `deeplink.test.ts` | `new?` 必须带参、路径与 git remote 匹配、notifications/notify 进通知、general/review 进通用、personalization/memories 进个性化、mcp/mcp-servers 进 MCP 服务器、git/worktrees 进权限、usage/profile/tokens 进用量、不支持的 host 为 noop |
| `composer-dictation.ts` | 听写快捷键（Ctrl+Shift+D）与转写拼接 |
| `composer-dictation.test.ts` | 不认 ⌘⇧D；空串/标点拼接 |
| `session-runtime.test.ts` | 队列隔离 / 编辑重排取出 / Stop-while-queued / persist 目标 / 直播预留 id / 收束空窗单测 |
| `turn-meta.ts` | 工具活动 label（含子 Agent prompt / id）；写盘工具相对路径（本轮审查）；`mergeChangedRelPaths` 只在路径新增时扩列表；`liveAssistantMeta` 把已改路径带进直播元信息（写入预览就开始挂「已改」）；`reuseLiveAssistantMeta` 在路径/活动没变时保住同一对象，避免工具心跳重挂直播行 |
| `turn-meta-write.test.ts` | 写盘相对路径；apply_patch hunk；合并本轮路径只在新增时返回 true；字段相同的直播元信息复用原对象 |
| `line-diff.ts` | 行级 diff、`buildFileDiff`、解析 unified diff；直播占位按行估高，`liveDiffBodyMinHeight` 只升不降以免占位换行跳贴底；`canOfferDiffPreviewCollapse` / `shouldCollapseDiffPreview` 历史长 diff 才折预览，直播中不折以免 +/- 停在第 20 行（对标 Codex #32030 / #38695）；`shouldReserveDiffCollapseFooter` 直播先占「收起变更」页脚，收束不再冒出 32px（对标 Codex #40788）；`DIFF_STAT_RESERVE_CH` / `formatDiffStatLabel` 给直播 +/- 预留宽（对标 Codex animated diff stat alignment）；`continueLiveDiffLines` / `nextClosedDiffLines` 已画 +/- 行退回同一对象（对标 Codex PatchApplyUpdated / #22860） |
| `patch.ts` | apply_patch 格式解析与应用 |
| `notebook.ts` | Jupyter .ipynb 读写辅助 |
| `provider-catalog.ts` | 内置接入预设（DeepSeek / xAI / OpenAI / Kimi / 智谱 / OpenCode Go）、主力型号展示名 `MODEL_LABELS` |
| `provider-validate.ts` | 当前 API 配置校验 |
| `provider-vision.ts` | 模型是否支持视觉（截图回灌） |
| `thinking-levels.ts` | 各厂商思考/推理水平与请求字段映射；`stepThinkingLevel` 供 ⌥, / ⌥.；`thinkingGaugeIndex` 给输入框旁思考条；`/reasoning` 解析与状态文案 |
| `oauth-gpt.ts` | ChatGPT 订阅凭据导入 |
| `oauth-xai.ts` | xAI SuperGrok 设备码 OAuth |
| `computer-use-status.ts` | Computer Use 环境检查聚合 |
| `browser-use-status.ts` | Browser Use 环境检查聚合 |
| `voice-status.ts` | Voice / Kokoro 状态 |
| `automation.ts` | 自动化任务类型；`destination` 新对话或回到指定对话；`runIn` 隔离 worktree / 本地项目；可选 `providerId` / `thinkingLevel`（空则跟随当前）；可选 `rrule` 与 `workspaceIds`（对标 Codex RRULE / 同一任务多个项目）；`filterAutomationJobs` 对标 Scheduled All / Active / Paused；`scheduledActivityConversationIds` 给 Activity「定时」；`applyScheduledTurnSettings` 只覆盖本轮；`applyScheduledTaskAction` 供对话内创建（对标 Codex Scheduled） |
| `automation.test.ts` | 默认新对话、绑定线程、对话不在则回退新建、忙时排队、本地/隔离、对话内创建、RRULE / 多项目 |
| `automation-schedule.ts` | 五字段 cron 与 RFC 5545 RRULE 分钟匹配（官方例 `FREQ=MONTHLY;BYMONTHDAY=1;BYHOUR=9;BYMINUTE=0`）；有 RRULE 优先 |
| `automation-schedule.test.ts` | cron 通配 / 步进、官方 RRULE、UNTIL、日程回退 |
| `automation-queue.ts` | 自动化审查队列（Triage）；条目带工作区与改过的路径，接受/拒绝只动这些文件；接受成功后推送，无 PR 时再创建；`markAllQueueRead` 供 ⇧Esc 与 Scheduled 页「全部标为已读」；`archiveEligibleQueueRuns` 归档已处理运行（对标 Codex archive eligible scheduled runs） |
| `automation-queue.test.ts` | 入队、未读计数、排序、路径回写、提交后推送 |
| `mcp-catalog-data.ts` | MCP 插件目录纯数据（渲染可 import） |
| `plugin-catalog.ts` | 汇总 MCP 目录导出与安装模板 |
| `slash-commands.ts` | 斜杠命令目录（菜单与 /help，含 /fork [local|worktree]、/side [问题]、/project、/task、/model、/archive、/rename、/pin、/unread、/usage、/init、/permissions、/memories、/copy、/fast、/reasoning、/skills、/stop、/status、/diff、/goal、/plan 切换计划模式、/plan-mode、/mcp（打开 MCP 状态；空配置打开设置 → MCP 服务器）、/feedback、/share、/local、/worktree、/approve、/subagents）；`slashItemsWithSkills` 把已安装 Skill 并进 `/` 列表；`matchUiSlashCommand` / `composerSlashLine` 给忙时排队、收束后再解析（对标 Codex Tab queue slash） |
| `side-chat-quote.ts` | 对话 / 终端 / 文件预览划选 → `/side` 旁路提问或插入当前输入框：摘录归一、拒输入框/直播行、拼引用块与旁路提示、追加不覆盖草稿（对标 Codex Ask in side chat / send selection to composer） |
| `side-chat-quote.test.ts` | 摘录截断、无问题/带问题提示、终端/文件标签、插入输入框引用、closest 拒绝 composer / 直播行、文件预览划选 |
| `bang-command.ts` | Composer 行首 `!` 直接执行 shell |
| `bang-command.test.ts` | 空 bang / 普通文本 |
| `fast-mode.ts` | `/fast` 解析与思考档位选择 |
| `fast-mode.test.ts` | on/off、off/low 优先 |
| `copy-output.ts` | `/copy` 取最近一条助手正文；有围栏或引用时列出整段 / 代码块 / 引用（对标 Codex /copy picker） |
| `copy-output.test.ts` | 跳过空助手行；围栏与引用分列、围栏内 `>` 不当引用 |
| `skills-status.ts` | `/skills` 已安装列表；侧栏 Skills 页跨项目合并与过滤 |
| `skills-status.test.ts` | 过滤与跨项目合并 |
| `agents-md.ts` | AGENTS.md 发现优先级、根到 cwd 目录链、32KiB 合并与 `/init` 脚手架；个人说明路径 `~/.sharker/AGENTS.md` |
| `agents-md.test.ts` | override 优先、目录链、截断、个人说明路径 |
| `memory-command.ts` | `/memories` 本对话选择器 / 覆盖解析与条目文案（不改全局；全局 `memoriesEnabled` 关则不注入不写入） |
| `memory-command.test.ts` | 空命令 pick、on/off/use/inherit、本对话覆盖优先、功能默认关 |
| `mcp-status.ts` | `/mcp` 已配置 Server 文案；`shouldOpenMcpSettings` 空配置且非 verbose 时打开设置 → MCP（对标 Codex Open MCP status） |
| `mcp-status.test.ts` | 空配置与 verbose 工具列表；空配置打开设置、已有 Server / verbose 不跳 |
| `mcp-config.ts` | MCP Server 契约：STDIO / Streamable HTTP、`enabled`、草稿校验（不写 OAuth） |
| `mcp-config.test.ts` | 名称 / 启用过滤 / 草稿 / HTTP 头与 SSE JSON-RPC |
| `mcp-http.ts` | Streamable HTTP 请求头与 SSE 解析 |
| `feedback-bundle.ts` | `/feedback` 本地诊断包（分类 / 说明 / 可否附带会话；不外发） |
| `feedback-bundle.test.ts` | 含状态、分类/说明、可省略会话诊断，且声明不外发 |
| `slash-commands.test.ts` | 斜杠目录含审查命令与过滤 |
| `personality.ts` | 务实 / 友好 / 关闭人格与 system 语气段（对标 Codex Pragmatic / Friendly / None；旧 `empathetic` 读成 `friendly`） |
| `personality.test.ts` | 别名解析、循环、提示词 |
| `review-prompt.test.ts` | `/review branch` / `commit` 解析、Review delivery 覆盖、自定义关注拼进提示 |
| `commit-pr-prompt.test.ts` | commit/PR 模板截断与 skill 拼接 |
| `ARCH.md` | 本层架构说明 |

## 设计原则

- 新增跨进程契约 **先改 `types.ts`**
- 用户图片 / 超长粘贴文本附件只存稳定路径与元数据；粘贴文本可带 `text` 供预览回插，不把大图 base64 放进会话 JSON
- 算法类放 shared，避免 renderer 引入 electron
- `process-phases.ts` 只做展示归组，不写入 IPC/消息类型/持久化

## 扩展点

- 新 `StreamChunk`：`types.ts` + `App.tsx` + UI
- 新 IPC：`ipc.ts` + preload + main
