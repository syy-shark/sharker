# Sharker Agent 能力全景

模型负责「想」，Harness 负责「能稳定做完」。工具不多，但覆盖桌面开发的主路径。

## 调用方式（Turn 管线）

```
handlePromptSubmit（接待：排队 / 插队 / 直接派发）
  → executeUserInput（主进程调度）
  → queryServe（占坑 turn_start）
  → processUserInput（斜杠命令 or 进入模型）
  → onQuery：@file 展开 + 压缩上下文 + system + 工作区快照 + 历史
  → queryLoop：
      模型流式回复
      → 若有 tool_calls：审批 / Ask User → 执行（只读可并行；`request_user_input` 单独等用户）→ 结果塞回 messages → 再调模型（默认最多 40 轮）
      → 若本轮改过代码：自动 npm run test/build（一次）
      → 纯文本则结束
  → UI 展示思考 / 工具时间线
```

权限：`sandbox` 仅限工作区（芯片 **Ask for approval**）；`full` 可访问整机（芯片 **Full access**）。输入框下方可切（对标 Codex permissions control beneath the composer）；`/permissions sandbox|full` 同一条路径。不发明 Approve for me / Auto / 命名 profile。网络：`open` / `local_only` / `disabled`。高危操作弹窗确认。模型可用 `request_user_input` 弹出 Ask User（选项 + Other），输入框先停用。

### 斜杠命令（不走模型）

| 命令 | 作用 |
|------|------|
| `/help` | 显示能力与命令列表 |
| `/clear` | 清空当前对话 |
| `/changes` | 打开右侧变更审查 |
| `/review` | 只读评审；空命令先选未提交 / 相对基线 / 指定提交（对标 Codex Choose Review against a base branch or Review uncommitted changes）；官方默认当前对话；Settings → General → **代码审查** 可改独立线程，并可指定审查模型（对标 Codex `review_model`，空则当前会话）；`/review here` / `detached` 单次覆盖；直播中走排队或注入，不 abort；写明 `branch` / `commit` / 关注点则跳过选择器 |
| `/personality` | 切换 Pragmatic / Friendly / None（对标 Codex Settings → Personalization；无参数则循环） |
| `/memories` | 空命令先选本对话 Use memories / Generate memories / Disabled / Inherit（对标 Codex chat-level memories；不改 Settings → Personalization 的 Enable memories）；功能关闭时本对话选择会记下，打开后才 Use / Generate；`on|off|use|inherit` 可直接改本对话 |
| `/mention` | 打开 `@` 文件选择器 |
| `/skill` `/skills` | 无参打开侧栏 Skills 页（对标 Codex open Skills in the sidebar / `codex://skills`）；带过滤参数时列出匹配项；`$` / `/skill` 仍打开输入框选择器；已安装 Skill 也会出现在 `/` 列表，选中写入 `$name` |
| `/files` `/terminal` `/browser` `/agents` | 打开右侧对应面板 |
| `/fork` | 分叉到新本地线程（拷贝全部消息，不复用源 worktree）；`/fork worktree` 立刻另建隔离 checkout（对标 Codex Copy into a new local chat or worktree）。顶栏分叉按钮走同一条整段路径。历史气泡悬停 **Fork** 只拷到该条（含），省略其后回合（对标 Codex fork from an earlier message / `thread/fork` `lastTurnId`）；直播未完成行不分叉 |
| `/side` `/btw` `[问题]` | Open side chat 并弹出窗（不切走当前对话）；带问题则在旁路线程立刻发送；划选历史 / 直播已出现正文、文件预览、集成终端或内置浏览器批注可 **Add to chat** 进 composer Selection 芯片（发送收成 `# Selected text:`），或 **Ask in side chat** 把摘录交给旁路（对标 Codex Add to chat / #37560、`/side [question]` 与 Ask in side chat / Annotation mode） |
| `/status` | 显示对话 ID、模型、权限、Fast、可写根（项目附加文件夹）、线程模式、分支、上下文占用（`used / limit（%）`）与本机今日用量；长线程从库取未瘦身全文再估，不按 UI 尾页（对标 Codex /status chat ID / context usage / writable roots，避免打开历史线程像 0%；不发明供应商额度）。Settings → General可打开输入框旁用量环（对标 Codex Show context window usage，官方默认关；悬停数字与 `/status` 相同，直播增量不重走整段历史） |
| `/diff` | 打开右侧变更审查看本地 diff |
| `/goal [文本\|edit\|pause\|resume\|clear]` | 设定目标：文本即首轮提示并写入后续 turn 的 system（对标 Codex Goal，不自动多小时循环）；空参查看；`/goal edit` 打开进度行改写（带文本则只改目标、不开新一轮）；进度行按钮 **Pause** / **Resume** / **Edit** / **Clear**，状态字 **Active** / **Paused**（对标 Codex desktop goal progress row），并显示设定后耗时 |
| `/permissions` | 切换 Ask for approval / Full access；无参显示当前值。输入框下方同一控件（对标 Codex permissions control beneath the composer），不发明 Approve for me / Auto / 命名 profile |
| `/fast` | 开关 Fast：有思考档位时降到 off/none/minimal/low。输入框旁同一芯片（对标 Codex `/fast` + composer 控件），不发明供应商 service tier |
| `/plan` `/plan-mode` | 空参切换本会话计划模式（输入框 **Plan mode** 芯片，快捷键 **Toggle plan mode**，不自动开一轮）；输入框无菜单时 `Shift+Tab` 同样切换（对标 Codex Best practices / slash：`/plan` 或 Shift+Tab，不抢 `/` `@` `$` 补全）。带说明则进入只读规划并开一轮调研。计划按会话隔离，不踩并行线程。产出后出 Proposed Plan 卡，可点 Yes, implement this plan（对标 Codex 桌面 Action Menu / TUI Implement this plan?；不发明 Clear context） |
| `/mcp [verbose]` | 命令面板 **Open MCP status**（对标 Codex Open MCP status）：列出已配置 Server；空配置打开 Settings → MCP servers；`verbose` 只在对话里尝试连接并列工具、不跳设置 |
| `/feedback` | 打开反馈对话框（分类 / 说明 / 附带会话）；Help / 命令面板 **Send Feedback** 同一条路径；只复制本机诊断，不外发（对标 Codex #26890，不发明上传 / Check for Updates） |
| `/share` | 打开只读快照（对标 Codex 桌面 Share / `/share`）：用户可见消息、思考摘要、改文件 diff；不含工具调用 / 命令输出；已知密钥脱敏后复制到剪贴板，不上传。对话框标题 **Share**，说明用官方 “The snapshot doesn't give other people access…” / 收录范围原文，按钮 **Close** / **Copy as Markdown**。打开时拍一帧，之后不跟直播 token 变。不发明官方 Who has access / Copy link 上传。文件菜单、命令面板、顶栏三点 Copy 子菜单与侧栏线程右键另有 **Copy as Markdown**（对标 Codex Copy as Markdown / #25201 / #25646）：从库取未瘦身全文静默复制，不打开对话框、不把全文灌进对话柱；附件与内联 `data:image` 用文件名 / `[Image]` 占位，不嵌 base64（对标 Codex #22894）。顶栏 Copy 子菜单同时提供 Copy working directory / Copy session ID / Copy deeplink；快捷键另有 Copy conversation path 与 Copy chat deep link |
| `/chat` `/task` | Start a chat without a project（对标 Codex `/task`；`/chat` 同义）。空线程侧栏标题默认 **New chat**（旧盘「新对话」仍当占位再推导，对标 Codex Desktop sidebar） |
| `/compact` | 本地压缩当前对话上下文并收可见历史；进行中在直播行显示 Compacting context（对标 Codex contextCompaction），Stop 不写成「已停止」。开轮自动压缩只缩模型上下文、不换可见对话柱 |
| `/resume` | 打开历史对话选择器 |
| `/title` | `/rename` 别名 |
| `/agent` | `/agents` 别名 |
| `/copy` | 复制上一条助手回复；有代码块或引用时先选整段 / 代码 / 引用（对标 Codex /copy picker）。Ctrl+O 仍静默复制整段 |
| `/delete` | 永久删除当前对话 |
| `/theme` | 打开外观设置 |
| `/debug-config` | 打印本机配置摘要（不含密钥） |
| `/local` `/worktree` | `/local` Run the chat in the selected local project；`/worktree` Run the chat in a new Git worktree（对标 Codex slash；顶栏仍是 Local / Worktree / Hand off，不发明 Hand off to Local） |
| `/approve` | 批准重试最近一次被拒的高危/越权操作（一次）；空闲时重派上一条用户消息 |
| `/subagents` | `/agents` 别名 |

### @file 引用

输入 `@` 弹出工作区文件模糊搜索（↑↓/Enter/Tab）；也可手写 `@src/App.tsx` 或 `@/绝对路径`（sandbox 内）。Harness 自动读取并注入文件内容。同一菜单也会列出其它对话（对标 Codex @ chats），选中后写入 `@chat/<id>`；Harness 只注入最近几条的截断摘要（最多 2 条对话），避免整段大线程拖垮上下文。

输入 `$` 弹出已安装 Skill（对标 Codex `$skill-name`）；选中后写入 `$name`，Harness 按名称匹配并注入该 Skill。`/skill` 与命令面板「引用 Skill」打开同一选择器。

### 审查行内评论

在右侧审查 diff 行上点 `+` 留下意见（评论留在 diff 上）。再点「插入输入框」把锚定到文件:行号的意见接到草稿，由你自己发送跟进（对标 Codex：After leaving comments, send a follow-up；不自动开一轮）。

### 审查对比与提交

审查面板对标 Codex Review：

- **未提交**：未暂存 / 已暂存；文件与 hunk 可暂存、取消暂存、还原
- **本轮**：只看本轮助手写过、仍在工作区的文件（写入预览一开始就计入，对标 Codex 约 0.5s 逐文件 / Last turn）；多文件夹项目里固定看 **全部仓库**，选择器不再落到单仓（对标 Codex Last turn All repos）
- **跨仓库**：附加文件夹若是独立 Git 仓库，审查顶栏出现仓库选择器，并显示各仓 +/- 行数；未暂存 / 已暂存 / 分支 / 提交 / 提交推送只作用于当前选中的仓库（本轮除外；主文件夹仍负责新对话 / AGENTS.md / Skill）
- **创建仓库**：项目还不是 Git 仓库时，审查面板提示并一键 `git init`（对标 Codex Review：prompt you to create one）；建在主文件夹，默认 `main`
- **分支**：相对 `origin/HEAD` → `main` → `master` 的已提交变更（只读，仍可留行内评论）
- **提交**：选最近一条 commit 看该次 diff（只读，对标 Codex Review → Commit）
- 点 **文件名** 按设置 `file_opener` 打开（`none` 为右侧预览）；**右键** 出打开菜单（打开预览 / 在访达或资源管理器中显示 / 展开或收起 diff，对标 Codex review Open in Finder）；Agent 写盘后文件树静默刷新，正在预览的同一文件在树内重读、不抬整棵 App（对标 Codex 打开文档/文件树跟着改，不折叠已展开目录）；点 **行背景** 展开或收起该文件 diff（可同时展开多个）；列表顺序与文件树一致（同层目录在文件前，对标 Codex review diff ordering）；直播写盘时审查列表不换行 key、静默刷新保住滚动（对标 Codex review panel scroll jumps）；顶栏 **展开全部 / 收起全部**（对标 Codex expand or collapse all diffs）；**⌘/Ctrl+单击** 某一行跳到该行预览；审查聚焦时 **⌘F / ⌘G** 在 diff 内查找（划选预填、跨文件、屏外命中展开并滚入，对标 Codex search in long review files）；顶栏 **换行** 切换长 diff 换行（对标 Codex Wrap long diff lines，默认开；换行时行网格收在对话柱内，不再 `max-content` 撑开）
- 填写提交说明后 **提交** 已暂存变更，可选 **推送** 当前分支
- **创建 PR**：调用本机 `gh pr create`（基线与分支对比相同）；成功后可打开链接
- 隔离 worktree 若仍是 detached HEAD，可在审查面板或顶栏 **Create branch here**（对标 Codex Create branch here）；顶栏、对话右键与项目菜单可 **Open in Finder / Open in Explorer / Open in File Manager** 当前线程项目目录（对标 Codex Open in Finder from thread menus）
- Composer **Ask for approval / Full access** 在输入框下方切换权限（对标 Codex permissions control beneath the composer）；`/permissions` 与设置 → Permissions 同一字段，不发明 Approve for me / Auto / 命名 profile
- Composer **Fast** 在模型旁开关最低思考档（对标 Codex `/fast` + composer 控件）；`/fast on|off|status` 同一路径，不发明供应商 Fast service tier
- Composer **Local / Worktree** 会交接代码：切到 Worktree 时把当前未提交变更带进 worktree；切回 Local 时把隔离变更带回来（目标必须干净）。同一会话记住关联的 worktree。顶栏 **Hand off** 在两者之间切换（对标 Codex Hand off in the chat header；不发明 Hand off to Local）。隔离可先选 **起点分支**（默认 HEAD；可搜索本地与远程跟踪分支，远程保留 `origin/…` 完整 ref，对标 Codex local branch search / #22635）。仓库根目录 `.worktreeinclude` 列出的、且已被 gitignore 的文件（以及 `AGENTS.override.md`）会在创建时拷进新 worktree。若仓库有 `.codex/environments/environment.toml`：`[setup] script` 非空则新建隔离 / 永久 worktree 时在该目录跑安装脚本；`[cleanup] script` 非空则归档或裁掉托管 worktree 时先快照再跑清理脚本（对标 Codex Local environments / #19480）。复用已有 worktree 不再跑 setup。仓库若有 `[[actions]]`，顶栏显示第一条动作（常为 Run），多条时展开菜单；`⌘⇧D` 在集成终端跑第一条（对标 Codex Run environment action 1；Ctrl⇧D 仍是听写）。不发明 Settings 环境编辑器或顶栏以外的 Actions 入口。侧栏把正在跑的线程单独列在 **进行中**，便于并行监督；对话旁可按时间 / 进行中 / 等待回复 / 未读 / 定时 / 置顶筛选（找不到时选「按时间」；定时列出绑定任务或未归档审查结果的对话，对标 Codex Activity Scheduled）。筛选菜单在有未读时可 **全部标为已读**（只清对话未读；`⇧Esc` 仍同时清审查队列）。侧栏铃铛或 `⌘⌥U` 开关 Activity（默认等待审批回复，对标 Codex Activity）。`⌘⌥A` 先切到等你回复的对话，再切进行中。空输入连按 Esc 回编上一条用户气泡并分叉。托管 worktree 默认建在 `~/.sharker/worktrees`（设置 → 权限 → Worktree 根目录可改绝对路径，对标 Codex Worktree root；改了不搬旧目录），默认只保留最近 15 个（0 为不自动删），删除前会快照未提交文件；目录被清理后输入区显示恢复横幅，再发送或点恢复会从快照重建。归档对话会清掉对应托管 worktree。`/init` 在仓库根写 `AGENTS.md`，`/memories` 可开关注入与写入。`/copy` 复制上一条助手回复（有代码块或引用时先选整段 / 代码 / 引用，对标 Codex /copy picker），Ctrl+O 静默复制整段，`/delete` 删除当前对话，`/theme` 打开外观，`/debug-config` 打印本机配置（不含 Key），`/share` 复制只读快照（脱敏、不含工具输出、不上传），直播中 Esc / Stop 停止当前回合（设置 → 键盘快捷键可改绑或解除；IME 选词不触发；中止卡写「已停止 · 47m 28s」，对标 Codex You stopped after；首轮未落库也保留用户气泡，不做未落地的 Resume 按钮），`/fast` 降思考档位，输入框旁思考档位条可点选或左右键升降（对标 Codex composer gauge），`/skills` 打开侧栏 Skills 页（带过滤参数则列出匹配项；对标 Codex open Skills in the sidebar），`/stop` 中止回合并关掉集成终端。`/approve` 批准重试最近一次被拒操作（一次，对标 Codex）；`/rename [标题]` 或 ⌘⌥R / 侧栏双击写入 `customTitle`；`/pin` 或 ⌘⌥P 置顶；`/unread` 或 ⌘⇧U 标未读（打开对话或 ⇧Esc 清除）；`/usage daily|weekly|cumulative` 看本机 Token 用量；设置 → Profile 或命令面板 Profile 看终身 Token、峰值日、连续活跃与近 14 日单色火花图（对标 Codex Settings → Profile，不假装供应商额度或最长任务）；`sharker://settings/usage|profile|tokens` 打开该页；⌘⌥O / ⌘⌥N New standalone chat（弹出窗、不拷目标、不切走当前线程；对标 Codex Quick chat）；⌘⌥⇧O 打开项目选择器；⌘⇧C 复制工作目录（内置浏览器聚焦时仍复制网址）；⌘⌥C 复制会话 ID；⌘⌥⇧C 复制对话路径（隔离 worktree 优先，否则工作区 cwd）。查找栏打开时 ⌘G / ⌘⇧G / F3 / ⇧F3 跳到下一条/上一条命中。Home / End 或 ⌘↑ / ⌘↓ 跳到对话顶/底（输入框、查找、预览、终端、浏览器不抢；End 回到贴底跟直播，对标 Codex #39181）。点对话柱后 ↑↓ / Page / Space 滚动（不抢输入框；上翻锁贴底，对标 Codex 桌面 #39851）。审批打开时 Enter 允许一次、Esc 拒绝（输入框菜单优先）。Ctrl+Y 重做应用操作；⌘+ / ⌘- / ⌘0 也认小键盘。行首 `!command` 打开右侧终端直接执行。⌘⇧O 与 ⌘N 一样新建对话。`/chat` `/task` 在全局工作区开无项目新对话（对标 Codex /chat）。项目三点菜单可 **创建永久 worktree**（独立项目，不自动删），也可 **归档对话** 一并归档该项目下的对话（进行中跳过以免中断直播，可在设置 → 已归档恢复；对标 Codex From a project's menu, select Archive chats）。

### 线程内查找

划选历史正文、**直播已出现正文**、文件预览、集成终端或内置浏览器批注会出现 **Add to chat** 与 **Ask in side chat**（对标 Codex desktop / #37560）。内置浏览器工具栏 **批注** 或聚焦时 `⌘.` 打开 Annotation mode：点元素或拖选区域后写备注，保存进同一条 Selection 芯片；Shift+点选区域，⌘/Ctrl+点立刻写入芯片不弹备注框（对标 Codex Comment on the page / hold Shift and click / Hold Cmd while clicking）；不发明 @Browser / Computer Use / Adjust 样式预览。加入对话进 composer `Selection N` 芯片，不把长摘录灌进输入框；发送收成官方 `# Selected text:` / `## My request for Codex:`。对话柱只画请求与可再点开的 annotation 芯片，长划选不撑开贴底（对标 Codex selected-text references remain after sending / #22670 / #20294）。芯片可预览、加备注、移除，或「插入正文」回退成引用块（备注对标 Codex response annotation comments / #33763，不发明 #22677 划选跟帖气泡）。`/` 与 `!` 仍清芯片。旁路提问仍把摘录交给新线程。Copy as Markdown 仍带全文划选块。

`⌘F` 或命令面板 Find in chat / Find next match / Find previous match：大小写不敏感扫用户/助手正文（含直播行），同一条里每处各算一次；长线程先在盘上检索，不回放整段也不灌进 DOM（对标 Codex #33907 thread/searchOccurrences）。有正文划选时预填查找词（对标 Codex Find starts with current text selection）。Enter / ↑↓ / `⌘G` / `⌘⇧G` / `F3` / `⇧F3` 跳转并高亮当前词（查找未开时先打开再跳，关闭栏时保留上次词；命中只改对话柱 `scrollTop` 并锁贴底，不 `scrollIntoView`，以免直播增高把镜头拽回底部；未加载的更早命中先揭开该 seq 起的一段再跳，屏外已加载行会先扩进窗口）。审查面板聚焦时同一组快捷键改搜当前对比的 diff（跨文件、屏外命中展开并滚入视口，对标 Codex search in long review files）；输入框 / 对话柱仍走线程查找。Search chats 官方默认不绑，走命令面板或 Settings → Keyboard Shortcuts。集成终端按线程保留，并可在同一线程开多个标签（对标 Codex terminal tabs per thread）；`!command` 与清屏只作用于当前标签。

### 人格

Settings → Personalization → **Choose a personality**，或 `/personality [pragmatic|friendly|none]`（对标 Codex Settings → Personalization / learn.chatgpt.com/docs/personalize：Pragmatic / Friendly / None；旧 `empathetic` 读成 Friendly）。只改回复语气，不改工具与权限。默认 Pragmatic。 None 关闭人格指令。

### 自动化审查队列

定时任务可选择 **每次新对话**（默认；环境可选隔离 Git worktree 或本地项目）或 **回到指定对话** 沿用上下文（对标 Codex Scheduled：return to the current chat / start a new chat，以及 worktree vs local environment）。独立任务可勾选多个项目、每次各开新对话（对标 one scheduled task run on more than one project），且不把当前对话切走。日程用五字段 cron，或高级 RFC 5545 RRULE（官方例 `RRULE:FREQ=MONTHLY;BYMONTHDAY=1;BYHOUR=9;BYMINUTE=0`）。模型与思考档位默认同当前会话，也可按任务显式指定（对标 Codex leave the model and reasoning effort on their default settings, or choose them explicitly）。Scheduled 页可按 **All / Active / Paused** 筛选，并 **Run now**（对标 Codex desktop Scheduled），审查队列可 **全部标为已读** 或 **归档已处理**（对标 Codex mark every run as read / archive eligible runs），不抢当前直播。目标对话不在了则回退新建；目标对话正在直播时只把提示词排进该会话队列（仍带着任务指定的模型），不中止、不抢当前镜头。也可在对话里让模型调用 `manage_scheduled_task` 创建或改任务（对标 Ask ChatGPT to create or update scheduled tasks）。结果进入侧栏 **Scheduled**（未读徽标）。可 **接受**（只暂存并提交该任务改过的文件，再尝试推送；若当前分支还没有 PR 则 `gh pr create`。推送/开 PR 失败不回滚提交，可在审查面板重试）、**修订**（打开线程继续改）、**拒绝**（只还原该任务改过的文件并归档）。没有记录到路径时不碰工作区其它脏文件。不打断当前线程。对标 Codex Triage。

`/review` 直播中 `review-findings` 围栏一闭合就把发现挂到审查 diff 对应行上，并展开这些文件（对标 Codex review findings appear as inline comments）；半截围栏不挂；闭合后只追加时不重扫围栏、不重 parse JSON。人手收起后不再自动拉开同一文件。收束后再从助手正文补一次。与人手评论一起发送。命令面板 Skills / Scheduled 用官方侧栏与深链标题（`codex://skills` / `codex://automations`）。

当前分支若已有 GitHub PR 且本机 `gh` 已登录，审查面板会拉取行内审查评论（对标 Codex PR Chat），可 **打开** PR 或 **处理评论**（把 `@login: 正文` 派进当前线程）。本地行内评论可 **发布到 GitHub**（`gh api` 写回 PR）。顶栏会显示 **PR #n** 芯片，点开审查面板。未安装 `gh` / 没有 PR 时不报错、不显示横幅或芯片。

### 命令面板

`⌘K` / `⌘⇧P` Open command menu；`⌘/` Open keyboard shortcuts。`⌘[` / `⌘]` 前进后退页面与对话（与 `⌘⇧[` / `⌘⇧]` / `⌃Tab` / `⌃⇧Tab` 切相邻线程分开；内置浏览器聚焦时不抢 ⌃Tab）；`⌘+` / `⌘-` / `⌘0` 放大、缩小、重置界面字号（写入Settings → Appearance，主进程锁定 pinch 缩放以免只改视图比例）。`Ctrl+L` 打开并清集成终端；View / 顶栏 / 命令面板 Open Terminal 先打开集成终端（对标 Codex #30659 / #37104 / learn.chatgpt.com Integrated terminal；Ctrl+` 仍是 Toggle terminal）；终端聚焦时 `⌘K` 也清屏（对标 Codex，此时不打开命令面板；`⌘⇧P` 仍开）。`⇧Esc` Clear all unread indicators。`⌘⇧A` Archive chat，命令面板「归档当前项目对话」走项目菜单同一条路径，`⌘⌥S` Open side chat，`⌘⌥A` Next chat needing attention（先等审批），命令面板另列 Previous chat or tab / Next chat or tab / Go to chat 1–9 / Open recent chat 1–6、Find next match / Find previous match / Restore previous composer prompt / Toggle review panel、Approve request / Decline request、Close current tab or window（对标 learn.chatgpt.com commands；切对话面板选中打开第 1 条，快捷键仍按数字选；审批命令无打开的请求时为空操作），`⌘P` Search files（对标 Codex Search files），`⌘⇧E` Toggle file tree（已打开再按则收起，对标 Codex Toggle File Tree / #20552），`⌘T` Open browser tab；View / 命令面板 Focus Browser Address Bar / Reload Browser Page 先打开浏览器再选中地址栏或刷新（对标 Codex #30659，不抢文件预览 Go to line）；命令面板 Go to line or focus browser address bar 在文件预览或已展开审查打开时走跳行框，否则选中地址栏（对标 learn.chatgpt.com commands）；命令面板另列 Browser back / Browser forward / Reload browser page without cache / Copy browser URL / Toggle browser browse or comment mode（对标 learn.chatgpt.com commands，先开标签再执行；聚焦快捷键仍只在浏览区内抢）；右侧面板打开时 `⌘W` 先关面板（不关窗）。浏览器聚焦时 `⌘L` 选中地址栏、`⌘R` 刷新、`⌘⇧R` 无缓存刷新、`⌘.` 切换浏览/批注（对标 Codex Toggle browser browse or comment mode）、`⌘←` / `⌘→` 前进后退、`⌘⇧C` 复制网址；文件预览或已展开的审查 diff 聚焦时 `⌘L` 打开跳行框（对标 Codex Go to line or focus browser address bar）。鼠标侧键后退 / 前进（浏览区内走网页历史，其它区域走工作台历史）。`⌘⇧[` / `⌘⇧]` 或 `⌘1–9` 切换当前项目对话；`⌘G` / `⌘⇧G` Find next match / Find previous match（对标 Codex Find next；Search chats 官方默认不绑，命令面板可按标题 / 正文摘要 / git 分支如 `fix/login-redirect` 搜）；`⌘⌥⇧O` 或 `/project` Open project picker；`⌘Z` / `⌘⇧Z` Undo last app action / Redo last app action（归档、项目批量归档、置顶、重命名、未读；输入框内仍是文本撤销）；`⌘⌥B` Toggle review panel、`⌃⇧G` Open review tab（对标 Codex Toggle review panel / Open review tab）、`⌃⇧M` Open model picker（对标 Codex Open model picker，不认 ⌘⇧M）；`⌘⇧D` Run environment action 1（对标 Codex Run environment action 1；Ctrl⇧D 仍是 Start dictation）；`⌘⇧E` Toggle file tree（右侧拖宽按窗口比例记忆，对标 Codex percentage-based file tree resizing）、`⌘⇧B` Toggle browser panel、`⌘⌥U` Toggle Activity view、`⌘⌥⇧U` / `/agents` 子 Agent 活动、`⌘J` Toggle bottom panel、`Ctrl+\`` Toggle terminal、`Ctrl⇧M` Open model picker，思考档位条在模型旁（对标 Codex model and reasoning control）。长对话在消息区 `⌘↑` / `⌘↓` 跳到顶/底（输入框内不抢光标）。Composer 麦克风或 `Ctrl⇧D` Start dictation（Web Speech API，对标 Codex Dictation）；`Ctrl⇧V` 或「语音」Start voice chat（听写自动发送，回复用系统 TTS 朗读）。顶栏可 **弹出当前对话** 到独立窗看直播（chunk 广播到所有窗）。空输入时 `↑` 恢复刚提交或上一条用户提示（对标 Codex：取消运行或取消 worktree 创建后，即使提示还没进对话也能按 ↑ 找回）。Composer 粘贴优先走 `text/plain`（及剥过的 HTML），避免 Word / PowerPoint 剪贴板把正文收成图片；超过约 1.6 万字收成 `Pasted text.txt`，可预览或「插入正文」。空输入或 `/goal` 无参数时把该附件折成真正的请求。用户气泡可编辑后从该条重发。后台线程完成会标未读并按Settings → Appearance → **通知**（从不 / 后台 / 始终，对标 Codex Notifications）弹系统通知；默认后台档在正在看且窗口在前台时不打扰。可打开 **运行时防止休眠**（主进程 `powerSaveBlocker`）与 **新弹出对话置顶**；弹出窗顶栏可再切 Always on top。写盘工具完成后，对话里立刻出现该文件 diff（直播中画出全部 +/- 并在外壳内跟尾，对标 Codex 回合中逐文件变更 / #38695；历史重挂才预览 20 行）；完成后助手消息显示 **已改 N 个文件**（写入 `meta.changedFiles`，点开审查；通知正文也带改文件数）。Dock 徽标只计本机未读对话。`sharker://threads/new`、`sharker://new?prompt=` / `path=` / `originUrl=`、`sharker://threads/<id>`、`sharker://settings`、`sharker://settings/personalization`、`sharker://skills` 打开侧栏 Skills 页、`sharker://automations` 打开对应本机界面（自动化深链同时打开创建流；不自动发送 prompt；不实现 Cloud plugins / pets / SSH）。`/reasoning [档位]` Choose the reasoning effort for the current chat（对标 Codex `/reasoning`）。`/chat` `/task` 在全局「对话」工作区开新聊天（Start a chat without a project，对标 Codex `/task`）。命令面板 `/task` `/compact` `/init` `/status` `/review` `/goal` `/plan` `/memories` `/reasoning` `/personality` `/approve` `/fork` 标题用 learn.chatgpt.com slash 原文，中文关键词仍可搜。`/model` 打开模型选择（也可带模型名直接切）。⌘⌥L 或命令面板复制当前对话深链。macOS 菜单栏提供 File / Edit / View / Window / Help（对标 Codex #14450；应用菜单 About / Hide / Hide Others / Show All / Quit 用官方英文，对标 #28543 About Codex；Window 为 Minimize / Zoom / Bring All to Front（窗口 Zoom，不是 View Zoom In）；File 含 New window / ⌘⇧N，对标 #12773；Edit 为 Undo / Redo / Cut / Copy / Paste / Select All；View 含 Toggle File Tree / Open Browser Tab / Find / Previous Chat / Next Chat / Back / Forward / Toggle Full Screen；Help 含 Codex Documentation / Send Feedback，对标 #26890，文档打开 developers.openai.com/codex，反馈仍只复制本机诊断、不上传、不发明 Check for Updates / Log Out；自定义项不抢渲染进程快捷键）。

### 排队与插队

- Settings → General → **Follow-up behavior**（对标 Codex Settings → General → Follow-up behavior）：默认 **Queue**，忙时 Enter 等到当前回合结束；也可改成 **Steer**（加入当前回合，下一工具/采样后交给模型，不中止直播）。输入框上方先画 Steer 预览，再画 Queue 后续。芯片短标签是 `Steer` / `Queue n`，不把 TUI「Messages to be submitted after next tool call」画进芯片。
- **⌘⇧Enter** 对单条消息使用另一种行为；**Tab** 始终 Queue。忙时输入 `/review`、`/status` 或 `!command` 先出现在输入框上方队列，当前回合结束后再解析（对标 Codex Tab queue slash；Steer 仍把原文交给当前回合）
- Settings → General → **Enter always sends** / **Require Cmd+Enter for multiline prompts** / **The modifier is always required**（对标 Codex Settings → General / `chatgpt.composerEnterBehavior`）；旧「用 ⌘Enter 发送」读成始终修饰键
- Settings → **Suggested prompts**：空对话先给出进行中 / 未读 / 最近更新的对话，再审查 / 设定目标；可关
- Settings → General → **代码审查**：`/review` 默认当前对话（官方 Settings → General → Code review Inline）；Detached 才新开审查线程。审查模型默认跟随当前会话，也可指定已配置 Provider（对标 Codex `review_model`，不改输入框模型）。直播中 Queue 或 Steer，不中止当前回合
- 设置 → 权限 → Git **Commit / PR 文案模板**：写入 system 与 `git-commit` skill（对标 Codex Git commit/PR prompts）
- 设置 → 权限 → Git **始终 force-with-lease 推送**（默认关）：审查面板 `git push --force-with-lease`，从不 `--force`（对标 Codex Always force push）
- 设置 → 权限 → Git **分支名前缀**：审查面板与 agent 新建分支时自动加上（对标 Codex Git branch naming）
- 设置 → 权限 → **项目与终端 / 命令输出**：简要 / 标准 / 详细（对标 Codex how much command output appears in chats）；标准只画输出尾部，详细完成后才默认展开，直播中不挂「查看输出」、退出码、「执行中… Ns」摘要、命令末行和过程行/直播头秒表心跳，以免工具一完成、末行刷新或秒表跳动就顶过程区；命令末行只留在片段 ref，不发直播 store；工具收束且没有新写盘时只换时间线该步（不必是末步；同一帧多条只读并行 complete_call 也只换这些步，不发明 Exploring 分组格），写盘 +/- / 参数或收束带核实 diff 只换该步，回答只换该工具的 diff 槽、已画正文不重拆（对标 ~0.5s / Edited 格，不复制官方 #38695），写盘收束同时新开工具时过程 remap 并追加、回答只换 diff 槽，写盘收束同时新开 status / 思考 / 散文 / ```demo / compress / 错误 / present_inline_demo 时过程 remap（status / compress 再追加该行）且回答只换 diff 槽以免藏直播 +/-，写盘收束同时新开 status+思考 / 思考+散文 / status+散文 时过程 remap（有 status 再追加该行）且回答只换 diff 槽，无新写盘的工具收束后同一帧新开 status+思考 / 思考+散文 / status+散文 / status+思考+散文 / 思考+```demo / status+```demo / status+思考+```demo 时过程 remap（有 status 再追加该行；规划下一步后本地/快模型首枚 think / token / ```demo 也走这条，think 或无思考首枚 token 可先把旁白 / 规划下一步标 done；规划下一步后同一帧 tool_start（status 可先标 done，可夹 think，已画散文也可被收口）只 remap 并追加工具；规划下一步后同一帧 present_inline_demo 只 remap 并追加 status、回答开演示槽；规划下一步后同一帧错误只 remap 并追加 status、错误正文只进回答；规划下一步后同一帧 compress 只 remap 并追加 status 与压缩步；规划下一步后同一帧 Stop 只 remap 并追加 cancelled status（思考不进过程）；规划下一步后同一帧 user_input_needed / approval_needed 可改写该行为 Question requested / 第一题 header / Awaiting approval，已在场时 think 后推新行只追加 status），前缀没变或只收束思考/status/散文/无新写盘的工具的新开一或多个工具（可带一条 Awaiting / Question requested 行）只追加这些步并封回答尾（同一 16ms 里 token 尾 + tool_start 可先加长再标 done、complete_call + add_call、只读并行多个 tool_start、tool_start + approval_needed / user_input_needed 也走这条，不发明 Exploring 分组格）、新思考只换旁白（无新写盘的工具收束后同一帧开思考也走这条，不复制官方 #24850 Thinking 卡住；think 尾 + 首枚 token 可先加长再标 done）、新散文只开回答尾、新 status 只追加过程步（对标 Reconnecting... n/5 / Compacting）、`compress` 收口 status 或无新写盘的工具后只追加已完成压缩步（对标 contextCompaction / complete_call）、审批挂上或收束只换工具步与 Awaiting approval 行（Deny 后同一帧 resolved + tool_done error 只把该行与工具收成 error，可再追加 规划下一步或下一工具；Allow once 后同一帧 resolved + 首枚 tool_preview 只换该行与写盘 +/-，回答只换 diff 槽，不复制 #38695 / #10760）、Ask User 挂上或改写规划下一步为 Question requested / 第一题 header 或单条 status 收口只换工具步与该行，作答后同一帧 resolved + tool_done 只把 Question requested 行与工具收成 done（不发明 TUI Questions n/n 历史格）、Stop 把多条 active 收成 cancelled 只换这些步（对标 You stopped after / preserved streamed activity）、错误收口 status 或无新写盘的工具后只开错误回答尾、新 `present_inline_demo` 或正文 ```demo 只开演示槽且过程不追加（不复制官方 #24850 Thinking 卡住），演示 HTML / 说明 / 收束只换该槽，不重拆过程（对标 Codex command output behind expand / #19260 / exec_cell complete_call / add_call / Thinking cell）
- 设置 → 权限 → Worktree **根目录**（对标 Codex Worktree root）：托管与永久 worktree 建在此绝对路径下，空则 `~/.sharker/worktrees`；`sharker://settings/worktrees` 打开该页。改了不搬旧目录
- 项目三点菜单 **Edit project** / **Archive chats** / **Pin** / **Unpin** / **Rename**（对标 Codex Edit project / Archive chats）：主文件夹负责新对话 / 默认 Git / AGENTS.md / Skill；附加文件夹可供右侧文件树浏览、`@` 搜索、文件引用跳转与沙箱读写，并可 **Make primary**（旧主路径留在附加列表）；**Add folder** 追加路径。其中不同 Git 仓库会出现在审查选择器（同仓子目录不另开一项）
- Settings → Appearance → **代码字体 / 代码字号**（对标 Codex Code font / Code font size）：审查、终端与对话代码共用 `--mono` 与 `--code-font-scale`；`sharker://settings/code-font` 打开该页。只换等宽栈与代码字号，不改主题色，不跟 ⌘+ / ⌘- 界面字号走
- Settings → Notifications：回合完成 **从不 / 后台 / 始终**、**批准通知**、**系统通知权限**。`sharker://settings/notifications` 打开该页
- Settings → Appearance → **Reduce Motion**（对标 Codex #16857）：关掉直播思考扫光，减轻 GPU；进度圈仍转（对标 #22787）。不跟系统辅助功能绑定。窗口在后台或直播行滚出视口时同样停扫光（对标 #16857 屏外指示器仍占 GPU / #40531），回到前台或滚回视口再开
- Settings → Appearance → **Keep a chat near your work** / **Always on top**（对标 Codex Settings；新弹出对话窗默认浮在其它应用之上）。顶栏 **Open in Popup Window** 弹出当前对话（对标 Codex #15162）；弹出窗内开关仍是 **Always on top**。不复制官方单例弹出窗 / IME 挡候选框（#15162 / #15487）
- 审批打开时 **Enter** Approve request（Allow once）、**Esc** Decline request（Deny）（对标 Codex Commands；不把 `/approve` 重试改成这两条）
- Settings → General → **Prevent sleep while running**（对标 Codex Prevent sleep while running）
- Settings → Personalization → **Enable memories**（对标 Codex Settings → Personalization Enable memories / `features.memories`，官方默认关）；打开后再设 **Use memories** / **Generate memories**（`memories.use_memories` / `generate_memories`）。`/memories` 只改当前对话（空命令先选 Use / Generate / Disabled / Inherit，不改全局）
- Settings → Personalization → **Choose a personality** 与 **Custom instructions**（写入 `~/.sharker/AGENTS.md`；对标 Codex Settings → Personalization / learn.chatgpt.com/docs/personalize；不改 `~/.codex`，不覆盖 `AGENTS.override.md`）
- `sharker://settings/general` 打开通用；`sharker://settings/browser` / `sharker://settings/history` 打开浏览器历史（对标 Codex Settings → Browser）；`sharker://settings/personalization` / `sharker://settings/memories` 打开个性化
- Settings → **MCP servers**：列表、开关、添加 STDIO 或 Streamable HTTP、Restart；传输说明用官方 “local process” / “access at an address”。写入 `~/.sharker/mcp.json` 或工作区 `.sharker/mcp.json`。`sharker://settings/mcp` 打开该页。不接 OAuth Authenticate / CIMD / DCR。对话里 `/mcp` 查看已连接的 Server；未配置时打开 Settings → MCP servers（对标 Codex Open MCP status）
- Settings → Browser：搜索 / 重新打开 / 删除内置浏览历史；按时间清除历史，并可清 Cookie 与缓存；下载默认进系统 Downloads，可改目录、恢复默认，或打开每次询问保存位置。地址栏输入匹配本机历史。只用独立 `persist:sharker-browser` 配置，不混系统 Chrome，不发明 @Browser 搜历史、导入系统配置或下载列表
- 对话与直播正文里的 http(s) 链接默认在内置浏览器打开（对标 Codex clicking a URL）；⌘/Ctrl+点击走系统浏览器；右键可选内置浏览器 / 系统浏览器 / 复制链接（对标 Codex #41122）。工作区本地 `.html` / `.htm`（对话链接、文件树、`file://`）同样进右侧内置浏览器，带行号的源码引用仍走文件预览（对标 Codex file-backed previews / #32773 / #36552）；地址栏可粘贴 `file://`。集成终端输出里的 http(s)（含 OSC 8）同样默认进内置浏览器，⌘/Ctrl+点进系统浏览器（对标 Codex 终端起开发服务器后点 URL / #38387）。`mailto:` 仍走系统。不发明 Shift+点、默认打开设置、自定义 Open with，也不发明 Browser Use 打开 `file://`
- 内置浏览器是单页：页内 `_blank` / `window.open` 仍在同一视口打开（对标 Codex #26863），不发明多标签条。右侧浏览器打开且已导航到 http(s)/`file://` 时，当前可见对话的下一轮 system 写入官方 `# In app browser:` 块（1 tab + Current URL，对标 Codex #39562）。起始页 / 其它 Tab / 后台会话不写。不发明 @Browser 绑定或 Browser Use 控制工具
- 设置 → **Profile**（对标 Codex Settings → Profile）：本机终身 Token / 回合、峰值日、连续活跃、近 14 日 Token 活动；没有最长任务时长或供应商额度
- 对话附件与正文渲染图可悬停 **复制** 或 **保存**（对标 Codex Save or copy rendered images）；**点击** 开视口自适应灯箱（对标 Codex image preview / #26851，默认 fit-to-window，不跟 ⌘+/- 界面字号放大裁切，Esc / 点背景关闭；不发明 ImageGen 画布、拖出或图廊）；**右键** 出页内菜单（查看大图 / 复制图片 / 保存图片；工作区图再加打开预览 / Open in Finder / Copy path，对标 Codex #17591 / #40778，不用会崩进程的原生 Save Image As）。只认本机附件、http(s) 与 `data:image`，不读任意 `file://`；工作区相对路径图（如 `![x](docs/foo.png)`）经文件预览同一条读盘通道成图，灯箱可再打开右侧预览；直播从文件头读固有尺寸首帧占位，未测到前 48px 高水位，成图后高度只升不降，避免 8rem / 小图塌贴底
- 写盘预览一开始对话里就出现 **已改 N 个文件** 卡（对标 Codex Files changed / 回合内 N files edited / 约 0.5s 逐文件）：点标题打开审查并切到本轮全部仓库；展开列出本轮短标签（默认 basename，同名带最短父路径）、文档/图片种类与文件 +/-，头栏画合计 +N −M（直播预留等宽，正文加长或追加无 +/- 的读工具不扫 +/- 指纹、不重跑合计；有 fileDiff / fileDiffs / editPreview 仍立刻合计，不复制官方 #38695 回合结束才出 diff；对标 Codex Edited N files / TUI render_changes_block），点文件名按 `file_opener` 打开，右键可打开 / Open in Finder / Copy path（对标 Codex #20700 / #21426）；本轮列表也会先出现预览已点名、git status 还没见到的路径（不编造 diff）；数字与直播 +/- 统计预留等宽，已画 +/- 行不跟参数流重绘（对标 Codex PatchApplyUpdated / #22860），侧栏进行中/未读占同一槽，文件树写盘重拉不再播进入动画；直播 token 与工具心跳不重绘侧栏 / 顶栏 / 文件树 / 审查 / ChatView 历史列；直播行不另挂行高 ResizeObserver，只让贴底观察内容柱；代码/diff 围栏跟尾只盯一层增高节点，不因 children 每枚 token 重挂；```demo 直播中父页不扫 iframe 全树量高，只信估高与 postMessage（对标 Codex #39120 / #32030，不复制官方 RO 风暴），直播过程区与回答尾在正文或思考只加长、同一工具只改详情时不重跑 buildAnswerParts（详情或无新写盘收束只换时间线该步，TurnFlow 不重扫整条步骤），思考/状态 token / 工具详情不重拆回答切片（预览 / diff 仍重拆），16ms flush 在思考/状态/散文/工具详情只加长时不扫 extractFinalContent，心跳同一数组则不扫不发、不排 16ms flush，think/token 末段已在增长时只续尾不扫准备中 status，思考增长只换旁白、时间线切片不含 thinkText 故不重绘 TurnFlow，折叠时不跑 liveThoughtBody，已闭合正文与复制条也不跟正文 token 重绘（16ms 与工具心跳只写直播 store，过程/闭合块/增长尾/回合元信息分订切片；增长散文里已画段落 / 列表项 / 表行 / 行内按对象身份 memo，引用定义 Map 与围栏槽对象在没变时复用，对标 Codex #22860）；工具心跳若已改路径/活动没变也不换直播元信息对象（对标 Codex animated diff stat alignment / sidebar jitter / review panel scroll jumps）；收束不再整块冒出跳贴底
- 助手对话里闭合的 `\(...\)` / `\[...\]` / `$$...$$` 画成公式（对标 Codex 桌面 KaTeX / #14985）；未闭合保持原文以免每 token 重排；不认 `$...$`（官方 tokenizer 也不认）；非法 TeX 回退原文；不发明用户气泡公式、文件预览数学或围栏 `tex` 开关
- 闭合的 ```mermaid / ```mmd 围栏在对话里内联成图（对标 Codex transcript Mermaid）；开闭共用同一 `MermaidBlock` 与 `CodeArtifactShell`（直播 `mer` 起就挂，不先画普通代码围栏），未闭合与成图前都显示代码尾，成图只换体内 SVG；成图前按节点/边/行数估高占位，成图后高度只升不降，避免代码尾换成图时把贴底顶跳；解析失败仍留同一外壳的代码尾（不换一套代码块）；按主题缓存 SVG，收束重挂时首帧仍是图，避免闪回源码
- 对话与直播正文里的本地文件引用（`src/foo.ts:12`、`#L12`、`` `foo.ts` ``、`(line N)`）默认点开右侧文件预览并跳到该行（对标 Codex View Code）。**右键** 出打开菜单（打开预览 / Open in Finder 或 Open in Explorer / Copy path；百分号路径先解码再打开或复制，解码后带空格的目录路径仍可点，对标 Codex file citation Open menu / #13123 / #17548）。Settings → General可改官方 `file_opener`（VS Code / Cursor / Windsurf / Insiders）；`none` 仍是应用内预览，不接自定义编辑器。文件树也可预览图片与 PDF（对标 Codex 在同一工作区打开文档/图片）；源码预览按扩展名语法着色（对标 Codex 桌面文件查看器 highlight.js / #18966，不发明 .tex）；图片按预览窗 CSS 像素 contain，不跟界面字号放大裁切（对标 Codex #26851 / #31112）；文件行右键打开预览 / Open in Finder / Copy path，目录只揭示 / 复制（对标 Codex file tree Open menu，不发明 Open with）；工作区 `.md` / `.markdown` 默认富预览，可切源码，带行号引用走源码并跳行；相对图与相对链接按文档目录解析（`details.md` 打开同目录文件），`%20` / 空格解开，YAML frontmatter 不当正文（对标 Codex View preview / #31389 / #21510 / #21707 / #34440），不发明就地编辑。xlsx / docx 等办公二进制不灌进文本，避免撑开面板
- 直播思考默认折叠成 Thinking（对标 Codex 桌面 blinking Thinking / Thought），点开才看旁白，避免增长正文把回答顶下去；整段散文廉价增量（已收段单独成闭合槽，增长尾固定 `prose-run-0`，空行收段不换尾 key 也不换 remark 树，文末单独换行不把表行拆成多槽，含脚注收束后也不换）、廉价画 GFM 表格（含单列、无两侧 `|`、分隔行未到先画表；`table-layout:fixed` 锁在对话柱内）、任务列表、`1)` / `ol start` 有序列表、项内引用 / 标题 / HR / 嵌套围栏 / 缩进代码（嵌套层自己松）、无引用脚注定义不画、引用懒续行硬换行、空 dest / 锚点 / 相对链接、危险协议清空、未闭合 `](` 先画链接、未闭合 `**` / `*` / `~~` / `~` / `` ` `` / `***` / `<https://` / `<email@` / `[^id` 先画标记、GFM 单 `~` 删除线、完整 `<!-- -->` 不画、http 图与工作区相对路径图、分隔线（含 `* * *`）、Setext / 行尾 `#` 标题、下划线强调、引用式链接 / 图片（含相对 dest）、dest 内成对括号、可点图 `[![img]](url)`、多反引号代码、链接标签内强调、HTML 实体、`www.` / 邮箱、脚注、硬换行（含列表续行与 `\\\n`）与缩进代码，并复用已闭合列表项/表格行（新表行不换已画表头 / 旧行 cells 引用）（增长尾最后一块（含段落软换行、嵌套项内引用 / 围栏、围栏 / 标题 / HR / 表闭合后的项后缀（标题后的表行另起项内表；闭合并栏后再起表 / 标题 / 引用 / 段落时围栏不动；缩进代码后的标题不并进 pre）、引用内围栏 / 标题 / 分隔线 / 缩进代码闭合后再起的后续段、闭合段落 / 表 / 列表 / 分隔线 / 缩进代码 / Setext 标题后再起的后续块（列表 / 表后的 Setext 用正文+下划线定位；前面已有同型引用 / 列表 / 表 / 围栏 / 缩进代码时从文末量最后一块）、缩进代码 / 脚注续行 / 引用内换行后的列表项、围栏 / 表 / 列表 / 引用 / 段落后的增长段）只重解析增长段，前面的标题/段落保持不动，对标 Codex #39061 / #34045）；`[label][id]` 不再吞掉后面的标记；廉价尾与收束后共用块边距 / 任务列表 class，直播围栏长行在对话柱内换行以免横向撑开，围栏复制条相对对话柱 sticky、块还在视口里就能复制整段（对标 Codex #20593，不发明换行开关），闭合围栏才 highlight.js 着色（对标 Codex 桌面 / #18966；`diff` 的 `+` / `-` 走 `--success` / `--danger`），未闭合直播围栏保持纯文本以免每 token 重高亮，已完成围栏行不跟 token 重绘（对标 Codex #39061 / #22860），直播中不挂「查看输出」、退出码、「执行中… Ns」摘要、命令末行直播头和过程行/直播头秒表心跳 detail（工具完成也不冒 chrome，对标 Codex #19260），秒表预留长回合宽度且只在文案会变时唤醒，工具间隙直播头停在最后一条实质步骤、不闪「规划下一步」（对标 Codex flashing thinking summaries），并把过程收成 Working / Worked for（对标 Codex 桌面折叠头，秒表仍走预留宽时钟；点开才看步骤；审批/失败仍露出；回答刚上屏时收回已展开的 Thought / Worked for，避免过程区在直播回答上方突然长高；收束后过程芯片仍留在回答上方，不整块对调），中止行写 You stopped after 47m 28s（仍认旧「已停止」脚注），正文槽（散文 / diff / demo）上屏就挂复制操作条，尚无正文时先占同一高度，柱尾 `LIVE_TAIL_SAFE_PX` 与输入区顶距避免操作条被 composer 阴影盖住（对标 Codex #41155），避免写盘后第一句回答再冒出躲进输入框（对标 Codex #40788 / #41155）；贴底在布局后同帧写 scrollTop（内容变高或输入框把视口挤矮都跟，对标 Codex 直播不被 composer 挡住）；离开贴底窗口的第一帧用已测量高度，避免 160px 估高跳（对标 Codex #38220）；收束换消息只有真贴底才强制滚到底，读历史不被拽走（对标 Codex #37849）；审批直播头 Awaiting approval（仍认旧「等待确认」），出现不 `scrollIntoView`、不上翻解锁，Enter/Esc 仍走输入框（对标 Codex Approve / Decline request / #10760）；开轮时预留助手 id 并把「连接模型并准备任务…」写入直播 store（不必等首枚 token），直播行与收束后历史行共用同一 `msg-${id}`，避免整行卸载重挂把贴底顶跳；收束 / 中止 / 发送失败先把最终片段写入直播 store 再提交历史行，且不先抹直播秒表 / 元信息；直播体已空且历史已挂同一 id 时只留历史行，避免 commit 后闪一帧空回答（对标 Codex preserved streamed activity when tasks complete / #37849）；直播中「回到底部」用即时滚动；写入/补丁参数一流到 path 就占文件 diff 槽，随后把已解析的 +/- 填进同一 `s.id-diff-N`（对标 Codex 约 0.5s 逐文件 diff / PatchApplyUpdated，不编造 hunk），`tool_start` / 完成后换核实行并用 memo 钉住，直播中不折 20 行并让代码/diff 外壳内层跟尾（对标 Codex #32030 / #38695，用户上翻不抢），超过预览行数时先占「收起变更」页脚，收束后同一实例保持展开以免跳，占位与真实行共用同一 diff 体且高度只升不降（对标 Codex #38695 / #22860），后续 token 不再重绘已完成的变更块；`reuseAnswerParts` 在写入预览重复派生时保住已闭合 diff / 正文对象；status 心跳退回同一数组（不写「执行中… Ns」摘要；末行带 ` · Ns` 先去掉秒表）、真实路径/末行才换活动工具；写入预览 / 收束也不换已完成工具对象，过程行 memo 不被打穿
- Composer `@` 统一引用文件 / 对话 / Skill（对标 Codex @ menu skills）；输入里的 `$name` 在发送前显示芯片，点掉即撤引用（对标 See skills inline before sending）
- 切换对话或离开聊天页再回来时恢复该会话的对话柱位置：上次贴底的仍跟最新，读历史的停在离开处（对标 Codex app 26.406 Preserved thread scroll position per conversation；本窗口内存，不落盘、不跨窗口）
- 长线程打开时只从库里取最近一段（对标 Codex `excludeTurns` + `initialTurnsPage`），上滑到顶再取更早一页进独立头页并滚到与尾页相接处（对标 Codex `thread/turns/list` / older history fetched as needed；不预拉全量、没有「加载更早」按钮、不在后台抽干，也不把更早页 prepend 进尾页 `messages`）。启动窗再按约 50KiB 人类可读预算瘦身：用户/助手正文走快路径，过长命令输出与思考点开「查看输出」/ Thought 再取（对标 Codex #38653）；落盘跳过仍是占位的消息，以免空壳盖掉库里的全文。⌘F 查找条在滚动层外占位、不盖直播正文（对标 Codex #40788 / #38220）；只扫用户/助手正文、不回放整段；直播命中单独算且只订 streaming 正文，命中列表没变不抬对话柱，当前命中在直播行时就地重标，token 不重挂历史气泡；首枚 token 只在预留行已进历史列时才因直播体显隐重建历史列（对标 Codex #33907 / #22860）；跳到未加载的命中再揭开命中起最多约 70 条，不把 [命中, 尾页) 灌进 React。发送 / 压缩 / 分叉从库取未瘦身全文给模型，不灌进当前 DOM（官方分页线程已弃用全量水合）；⌘↑ 到顶只加载独立 `historyHead` 最旧一页（约 70 行），下翻再按页接回尾页，不把瘦身全文写进 `messages`、也不把 `historyStartSeq` 置 0（以免落盘删掉中间页）；直播中不取头页以免卡住贴底，收束后再取；点开输出/思考再取一条原文。落盘带 `historyStartSeq`，不删尚未加载的更早页。查找把窗口滑到命中行，不从命中铺到最新
- 切换对话或工作区时恢复未发送的输入与附件（对标 Codex restore unsent prompts when switching tasks）；发送或 slash 后清掉该会话草稿
- Composer 可从 Finder / 资源管理器粘贴或拖入源码与文本文件，按原名收成附件并折进本轮（对标 Codex non-image file pasting）；Word 双层剪贴板仍优先正文；超长粘贴仍收成 `Pasted text.txt` 可回插；zip / 办公二进制不收，请用 `@` 引用工作区文件
- 用户气泡、输入框与排队条保留换行，并把长 URL 折在对话柱内（对标 Codex #37709 / #38380 / #38704）；历史 CRLF 先归一再画，避免空白行或横向撑开把直播贴底顶跳
- 排队消息出现在输入框上方，可编辑、重排、删除；预览最多 3 行 / 240 字，整条队列限高（对标 Codex #39864 pending input wrapping / #40788，长排队不把直播视口挤进输入框）。空闲可立即 Send，直播中点 **Steer** 推进当前回合（对标 Codex queued chip Steer），失败留在队列、不中止直播（不进对话滚动区，避免直播贴底跳动）。忙时 Queue / Steer 不贴底、不离开正在读的 `historyHead`（对标 Codex #38220）；只有空闲发送新用户气泡才跳到底（对标 Codex #13698 by design）。读历史时直播继续长高，输入区上方的 Jump to bottom 改成 **New message** 并在 composer-stage 流里占位（不 absolute 盖直播尾），点了才跟，不抢阅读位置（对标 Codex #38220 new message affordance / #40788）
- 当前 turn 结束后默认按序执行下一条；可点 **暂停队列** 先审再继续（对标 hold queue；#26502 官方桌面尚未交付 Hold 文案）
- Composer **Steer** 按钮 / ⌘⇧Enter 把本条加入当前回合（不中止直播）；Steer 失败改 Queue，只有没有进行中回合才新开（对标 Codex Steer，不 abort）。首轮对话 id 还没落库时，忙时 Steer / Queue 先出现在输入框上方芯片，等会话就绪再冲进当前回合或队列，不中止也不丢跟进。回合正常结束仍未排空时收成用户气泡并立刻续跑（对标 Codex leftover pending input at task finish）；中止 / 失败或本地 `!` 命令从未采样则还回 Queue（对标 Codex #18290 / 中止还原 composer）

---

## 一、已有工具（现在就能用）

### 看 · 搜

| 工具 | 能做什么 |
|------|----------|
| `list_dir` | 列目录（可指定深度）。直播头 `List basename`（对标 Codex List） |
| `glob_file_search` | 按文件名模式找文件。直播头 `Search pattern`（对标 Codex Search） |
| `grep` | 在目录下搜文本（结果截断 200 行）。直播头 `Search query in path`（对标 Codex Search） |
| `read_file` | 读文件（支持 offset/limit）。直播头 `Read basename`（对标 Codex exec_cell Read） |
| `view_image` | 查看本地图片（对标 Codex `view_image` / #36966）：过程行 Viewed Image，工具结果只报路径与体积，视觉模型再回灌像素；`detail=original` 提高保真。`read_image` 同路径别名。不发明 ImageGen 或关闭开关 |

### 改 · 整理文件

| 工具 | 能做什么 |
|------|----------|
| `write_file` | 新建或整文件覆盖 |
| `search_replace` | 精确替换片段（改 bug 首选） |
| `apply_patch` | 多 hunk patch |
| `delete_path` | 删文件/目录（递归删需确认；删后 Harness 自动验证路径是否消失） |
| `move_path` | 移动/重命名 |
| `create_directory` | 建目录 |

### 卸载 · 系统应用

| 工具 | 能做什么 |
|------|----------|
| `uninstall_application` | 完整卸载：停进程、brew cask、.app、~/Library 用户数据、验证（需审批） |
| `verify_removal` | 检查目录/cask/进程/.app 是否仍有残留；Harness 在误用 rm 卸载后会自动调用 |

### 跑 · 命令

| 工具 | 能做什么 |
|------|----------|
| `run_terminal_cmd` | bash 执行命令（`rm` 后自动验证路径；cwd 锁在工作区）。直播头 Running / Ran + 短命令（对标 Codex exec_cell），不发明 You ran |
| `read_thread_terminal` | 读当前对话集成终端当前标签的输出尾（对标 Codex inspect terminal；不请用户粘贴） |

### Git / Tasks / Sub-agents

见 `tools/ARCH.md` 完整列表。`manage_scheduled_task` 在对话里创建或改定时任务（对标 Codex Ask ChatGPT to create or update scheduled tasks）。`agent_spawn` 会按**父线程**归组，不进侧栏对话列表（对标 Codex 不把 child 当顶层会话）。右侧 **活动** 面板（`⌘⌥⇧U` / `/agents`）可看进行中/已结束、直播正文、停止与转向。启动子 Agent 时自动打开该面板。主线程时间线里的启动子 Agent / 转向 / 取结果步骤可点 **打开**，选中对应孩子（对标 Codex「Open a subagent thread from the activity shown in the main thread」）。快照落 `~/.sharker/subagents.json`，重启后仍能查看已结束的孩子；启动时仍在跑的标为「应用重启后中断」。

### 子 Agent 活动

对标 Codex Activity / Subagents：只挂在当前对话下；审批沿用父 turn，避免权限请求丢失。可从主线程活动点开；重启后从磁盘恢复。

### Web

| 工具 | 说明 |
|------|------|
| `web_fetch` | HTTP 抓取 + 粗略 HTML→文本；直播与过程行共用官方 Searching the web / Searched + URL detail（对标 Codex open_page / #9960）。不发明单独 WebFetch 格（#7390 已关）或 Fetched |
| `web_search` | DuckDuckGo Instant Answer；直播 Searching the web / 完成后 Searched + query detail（对标 Codex TUI web_search_header / #9960 / #24693），过程区 title+url 来源花片（#32898）。不发明 find_in_page / web.run / 官方 search API |
| `open_url` | 在用户的系统浏览器 / Chrome 中可见地打开 URL（用户明确要求打开网站时） |
| `present_inline_demo` | 把自包含 HTML/CSS/JS **嵌进对话**做演示；工具一开始就占演示槽（直播开槽不重拆过程 / 回答，未可绘先 96px 骨架叠在同一 iframe 上，HTML 增长与收束只换该槽，可绘只换 srcDoc）；正文 ```demo 围栏未写完 `dem` / `viz` 就占同一 `demo-stream` 槽（直播开槽与 HTML 增长不重拆过程 / 回答；不先当散文再跳；不认 ```diff / ```html / ```vim），开闭都挂 `InlineDemo`；首帧按声明高度 / 块数估高并缓存实测，避免 48px 猛涨顶跳贴底；教学/可视化请用此工具，不要写文件再开浏览器 |
| `request_user_input` | 结构化提问（对标 Codex 桌面 Ask User / #41350）：1–3 题、每题 2–3 个互斥选项，客户端补 Other；输出 `{ answers: { [id]: { answers } } }`。过程行 Question requested / N questions requested / 第一题 header。Default 与计划模式都可用。输入框禁用并提示先回答。不发明选项备注（#37365）、分页问卷（#9926）或 TUI Questions n/n 历史格。Stop 解开等待 |
| `update_plan` | 官方任务清单（对标 Codex `update_plan` / PlanUpdate）：`plan[].step` + `pending` / `in_progress` / `completed`，可选 `explanation`。工具结果固定 `Plan updated`，过程区画清单。不是计划模式，不发明 `/plan-model` 或底栏 Step N/5 徽章 |
| MCP 工具调用 | 动态 `mcp_{server}__{tool}` 与 `mcp_call_tool`：直播头 Calling / Called `server.tool({compact})`（对标 Codex `McpToolCall` / #20677）。过程区不倾倒 JSON。不发明 Apps / node_repl / @Browser，也不把进行中标成已完成（#22300） |

### 内联可视化规范（强制）

完整规范见 **[inline-demo-spec.md](./inline-demo-spec.md)**。摘要：

- 嵌在聊天里，禁止写 html + 开浏览器当「演示」
- **无**超大空白、文字不溢出卡片、多栏不重叠
- 步骤按钮必须可点且有效
- 假终端只包日志块（三色灯由宿主加）；日志连续无空槽
- 提交历史用紧凑列表，不要空高 graph

### Browser（Playwright 可选）

| 工具 | 说明 |
|------|------|
| `browser_navigate` / `browser_snapshot` | 无头 Chromium 打开/快照 |
| `browser_click` / `browser_type` | 页面交互（需审批） |
| `browser_screenshot` / `browser_close` | 截图 / 关闭会话 |

用户说「打开网站」「用 Chrome 打开」时应使用 `open_url`；`browser_*` 只用于无头网页检查与自动化。`browser_*` 需 `npm install playwright && npx playwright install chromium`。

可选 Chrome native host：`bash scripts/setup-browser-use.sh`。设置 UI：**设置 → Browser Use**。

### Computer Use（桌面 · macOS）

| 工具 | 说明 |
|------|------|
| `desktop_doctor` | 检查 screencapture、cliclick、可选 cua-driver |
| `desktop_screenshot` | 全屏截图 → `.sharker/desktop/` |
| `desktop_list_windows` | osascript System Events 列窗口 |
| `desktop_get_ui_tree` | 窗口列表 + 工作流指引 |
| `desktop_click` / `desktop_type` / `desktop_key` / `desktop_scroll` | cliclick / osascript（需审批） |

需授权 **辅助功能** 与 **屏幕录制**。可选：`bash scripts/setup-cua-driver.sh`、`brew install cliclick`。

#### 视觉截图回灌

`desktop_screenshot` 执行后，若当前模型**支持视觉**（设置 → 模型 →「视觉」开启或自动识别 gpt-4o 等），Harness 将 PNG 作为多模态 `user` 消息回灌，模型可「看到」屏幕再决定坐标点击。

#### 推荐流程

1. 确保应用窗口在前台
2. 截图 → **视觉模型看图**
3. 坐标 `desktop_click` → 输入 → 再截图核对
4. 点击/打字需用户在审批块点 Allow once

**模型建议**：桌面任务请用支持**原生工具调用 + 视觉**的模型（gpt-4o、Claude 3+、Gemini 等）。

**文本工具解析**：不支持 function calling 的模型若在正文输出伪工具调用，Harness 会解析并执行，同时从可见回复里隐藏该参数块。

### Voice（TTS MVP）

| 工具 | 说明 |
|------|------|
| `voice_read_aloud` | macOS `say` 朗读 |
| `voice_stop` | 停止朗读 |

可选 Kokoro TTS：`bash scripts/install-kokoro-runtime.sh`。

设置 UI：**设置 → Voice**；安装见 `docs/computer-use-setup.md`。

---

## 二、Harness 已启用的策略

| 策略 | 作用 |
|------|------|
| @file 注入 | 用户 @path 自动附文件内容 |
| 并行只读 | 同轮多个只读 tool_calls 用 Promise.all |
| 视觉截图回灌 | 截图工具后向视觉模型注入 PNG（需 Provider 开启视觉） |
| 文本 XML 工具解析 | 弱模型输出的 `<tool_call>` / `<function=name>` 自动转 tool_calls |
| 工作区快照 | 干活前注入 README、package.json、顶层目录 |
| 网络模式 | open / local_only / disabled |
| 上下文压缩 | 用量超 85% 自动摘要；开轮达阈值先在直播行显示 Automatically compacting context（对标 Codex 桌面），摘要完成后过程行 Context automatically compacted。自动压缩只缩模型上下文，不换可见对话柱（对标 Codex #33285 / #26583）；`/compact` 才收可见历史 |
| 短暂中断重连 | 首包前 429/502/503/504 与网络抖动最多重连 5 次，直播行显示 `Reconnecting... n/5`（对标 Codex #37337 Turns reconnect / 桌面 #19821）；旧「正在重新连接… n/5」回放仍认。已吐出正文 / 思考 / 工具参数后不重开，以免重复 |
| 工具准备头 | 参数还在流时直播头用官方 Read / List / Running / Edited / Searching the web，不闪「正在准备…」（对标 Codex 工具格一开始就出标题）。完成后仍当桥接行去掉 |
| 开轮空档头 | 发送后、首包前直播头用 Thinking（对标 Codex 无工具空档 / TUI #9810 立刻出状态）。旧「连接模型并准备任务…」回放仍认，不当历史过程行 |
| 自动验证 | 改代码后自动 test/build/lint |
| Plan/Build | enter_plan_mode → Yes, implement this plan → 全工具 |
| 续跑提醒 | 对可执行任务，若模型停在启动服务器/打开/检查等中间话术但没有工具调用，会继续 nudging 直到完成或遇到真实阻塞 |

---

## 三、与 Codex Desktop 对照（Gap Matrix）

| Codex 功能 | Sharker 状态 | 说明 |
|------------|--------------|------|
| Coding 看搜改跑 | **done** | read/write/grep/terminal/git/verify |
| Plan 模式 | **done** | enter_plan_mode + Proposed Plan / Implement this plan? Action Menu（#10561）。不发明 Clear context |
| `update_plan` 清单 | **done** | 过程区 checklist + 直播头当前步 / `Plan · n/m`。不发明底栏徽章 |
| @file 引用 | **done** | `@path` 注入 |
| 并行只读工具 | **done** | query-loop Promise.all |
| Computer Use 设置 UI | **done** | 设置 → Computer Use（环境检查） |
| Browser Use | **partial** | builtin browser_*（Playwright）；可选 native host |
| Computer Use macOS | **partial** | screencapture/cliclick `desktop_*` |
| 视觉截图回灌 | **done** | agent/vision-feedback.ts + Provider vision 开关 |
| `view_image` | **done** | 官方读本地图（#36966）：短结果 + 视觉回灌；相对路径接工作区 cwd（#29526）；过程区 ImageView 卡（#7468）。不发明 ImageGen / 关闭开关 |
| web search 活动 | **done** | 直播 Searching the web / 完成后 Searched + query/URL detail（TUI web_search_header / #9960 / #24693）；`web_fetch` 同格（官方 open_page，#7390 不另开 WebFetch）。过程区 title+url 来源花片（#32898）。不发明 Fetched / find_in_page / 官方 search API |
| MCP 工具调用活动 | **done** | 直播 Calling / Called `server.tool(args)`（#20677 / #23236）；不倾倒 JSON、不抄 InProgress 当完成（#22300）。不发明 Apps / node_repl |
| 命令 Running / Ran | **done** | 直播头 `Running cmd` / `Ran cmd`（对标 Codex exec_cell）。不发明 You ran / unified-exec |
| 探索 Read / List / Search | **done** | `read_file` / `list_dir` / `grep` / `glob_file_search` 过程行用官方 Read / List / Search + basename。无 segments 的旧 ProcessTimeline 回放也认中文旧 label。不发明 Exploring 分组头或完整路径标题 |
| 写盘 Edited / Deleted | **done** | 过程行 Added / Edited / Deleted + basename，多文件 Edited N files，失败补丁 Failed to apply patch（对标 Codex render_changes_block）。写盘卡头同步。旧时间线回放同样 remap。不发明回合 Undo，write_file 不一律标 Added |
| Accessibility 窗口树 | **partial** | `desktop_get_ui_tree` / `desktop_list_windows` |
| Agent Workspace 隔离 | **partial** | networkMode MVP |
| Voice STT/TTS | **partial** | voice_* 本地 say；无 conversation-mode STT 循环 |
| Read Aloud / Kokoro | **deferred** | 可选 install-kokoro-runtime.sh |
| Chrome 扩展 + native host | **deferred** | 可选 scripts/setup-browser-use.sh |
| Remote Control / Mobile | **deferred** | 需 Secure Enclave 替代 + app-server 守护 |
| Turns reconnect | **partial** | 首包前短暂中断最多 5 次并显示 `Reconnecting... n/5`（对标 Codex #37337 / 桌面 #19821）；通用 Chat Completions 无 event cursor，已流出 token 后不重开同一流 |
| 编辑快照/撤销 | **missing** | 路线图 |
| `.sharker/AGENTS.md` | **done** | 全局 `~/.sharker` + 根到 cwd；`/init` 写当前目录脚手架（含 Code Review Rules）；override 优先 |

**Sharker 优势**：Harness 源码可控、自定义 API、git worktree、sub-agents、plan 模式。

---

## 四、外部依赖（用户安装）

| 用途 | 包/二进制 |
|------|-----------|
| 截图 | macOS `screencapture` |
| 坐标输入（可选） | `brew install cliclick` |
| 浏览器自动化 | `npm install playwright` + `npx playwright install chromium` |
| TTS（本地） | macOS `say` |
| TTS（高质量） | Kokoro — `bash scripts/install-kokoro-runtime.sh` |

---

## 五、你怎么用才最顺

1. **工作区选对**：写代码指到仓库根；整理桌面指到桌面或子文件夹。
2. **权限**：默认 sandbox + open 网络；敏感环境可 Closed 网络。
3. **Computer Use**：设置 → Computer Use 查看环境；桌面任务需视觉模型。
4. **说清楚目标**：「修 X 文件的 Y bug」比「看看」更省轮次。
5. **卸载软件**：说「删掉 Steam / 卸载 XX」时 Harness 会注入提示并优先走 `uninstall_application`；误用 `rm -rf` 时会自动跑 `verify_removal`，且删除后工具输出会标注 STILL EXISTS。
6. **提交/推送**：口头说清楚，否则会拦。
