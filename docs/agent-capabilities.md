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
      → 若有 tool_calls：审批 → 执行（只读可并行）→ 结果塞回 messages → 再调模型（默认最多 40 轮）
      → 若本轮改过代码：自动 npm run test/build（一次）
      → 纯文本则结束
  → UI 展示思考 / 工具时间线
```

权限：`sandbox` 仅限工作区；`full` 可访问整机。网络：`open` / `local_only` / `disabled`。高危操作弹窗确认。

### 斜杠命令（不走模型）

| 命令 | 作用 |
|------|------|
| `/help` | 显示能力与命令列表 |
| `/clear` | 清空当前对话 |
| `/changes` | 打开右侧变更审查 |
| `/review` | 只读评审；默认按设置 → 权限 → Git **审查交付**（独立线程 / 当前对话，对标 Codex Review delivery）；`/review here` 或 `detached` 单次覆盖；`/review branch` 相对基线；`/review commit [sha]` 指定提交（对标 Codex Review a commit）；剩余文字作自定义关注（对标 Codex `/review Focus on edge cases and security issues`） |
| `/personality` | 切换务实 / 友好 / 关闭（对标 Codex Friendly；无参数则循环） |
| `/mention` | 打开 `@` 文件选择器 |
| `/skill` `/skills` | 打开 `$` Skill 选择器（对标 Codex `/skills`）；带过滤参数时列出匹配项；已安装 Skill 也会出现在 `/` 列表，选中写入 `$name` |
| `/files` `/terminal` `/browser` `/agents` | 打开右侧对应面板 |
| `/fork` | 分叉到新本地线程（拷贝消息，不复用源 worktree）；`/fork worktree` 立刻另建隔离 checkout（对标 Codex Copy into a new local chat or worktree） |
| `/side` `/btw` `[问题]` | 旁路新线程并弹出窗（不切走当前对话）；带问题则在旁路线程立刻发送；划选历史正文或集成终端输出可「旁路提问」把摘录交给旁路（对标 Codex `/side [question]` 与 Ask in side chat） |
| `/status` | 显示对话 ID、模型、权限、线程模式、分支、上下文占用与本机今日用量 |
| `/diff` | 打开右侧变更审查看本地 diff |
| `/goal [文本\|edit\|pause\|resume\|clear]` | 设定目标：文本即首轮提示并写入后续 turn 的 system（对标 Codex Goal，不自动多小时循环）；空参查看；`/goal edit` 打开进度行改写（带文本则只改目标、不开新一轮）；进度行可暂停 / 继续 / 编辑 / 清除，并显示设定后耗时 |
| `/plan` `/plan-mode` | 空参切换本会话计划模式（输入框「计划」芯片，不自动开一轮）；带说明则进入只读规划并开一轮调研。计划按会话隔离，不踩并行线程。产出后可点 Build 执行 |
| `/mcp [verbose]` | 列出 `~/.sharker/mcp.json` 已配置 Server；`verbose` 尝试连接并列工具 |
| `/feedback` | 打开反馈对话框（分类 / 说明 / 附带会话）；只复制本机诊断，不外发 |
| `/compact` | 本地压缩当前对话上下文 |
| `/resume` | 打开历史对话选择器 |
| `/title` | `/rename` 别名 |
| `/agent` | `/agents` 别名 |
| `/copy` | 复制上一条助手回复（Ctrl+O 静默复制） |
| `/delete` | 永久删除当前对话 |
| `/theme` | 打开外观设置 |
| `/debug-config` | 打印本机配置摘要（不含密钥） |
| `/local` `/worktree` | 交接回本地 / 进隔离 worktree |
| `/approve` | 批准重试最近一次被拒的高危/越权操作（一次）；空闲时重派上一条用户消息 |
| `/subagents` | `/agents` 别名 |

### @file 引用

输入 `@` 弹出工作区文件模糊搜索（↑↓/Enter/Tab）；也可手写 `@src/App.tsx` 或 `@/绝对路径`（sandbox 内）。Harness 自动读取并注入文件内容。同一菜单也会列出其它对话（对标 Codex @ chats），选中后写入 `@chat/<id>`；Harness 只注入最近几条的截断摘要（最多 2 条对话），避免整段大线程拖垮上下文。

输入 `$` 弹出已安装 Skill（对标 Codex `$skill-name`）；选中后写入 `$name`，Harness 按名称匹配并注入该 Skill。`/skill` 与命令面板「引用 Skill」打开同一选择器。

### 审查行内评论

在右侧审查 diff 行上点 `+` 留下意见，再点「发送评论」：会把锚定到文件:行号的意见派发给当前对话，Agent 按最小范围修改。

### 审查对比与提交

审查面板对标 Codex Review：

- **未提交**：未暂存 / 已暂存；文件与 hunk 可暂存、取消暂存、还原
- **本轮**：只看上一轮助手写过、仍在工作区的文件
- **分支**：相对 `origin/HEAD` → `main` → `master` 的已提交变更（只读，仍可留行内评论）
- **提交**：选最近一条 commit 看该次 diff（只读，对标 Codex Review → Commit）
- 点 **文件名** 打开右侧预览（本机文件打开路径，不对标外部默认编辑器）；点 **行背景** 展开或收起 diff；**⌘/Ctrl+单击** 某一行跳到该行预览；顶栏 **换行** 切换长 diff 换行（对标 Codex Wrap long diff lines，默认开；换行时行网格收在对话柱内，不再 `max-content` 撑开）
- 填写提交说明后 **提交** 已暂存变更，可选 **推送** 当前分支
- **创建 PR**：调用本机 `gh pr create`（基线与分支对比相同）；成功后可打开链接
- 隔离 worktree 若仍是 detached HEAD，可在审查面板或顶栏 **创建分支**（对标 Codex Create branch here）；顶栏也可 **打开隔离 worktree**
- Composer **本地 / 隔离** 会交接代码：切到隔离时把当前未提交变更带进 worktree；切回本地时把隔离变更带回来（目标必须干净）。同一会话记住关联的 worktree。顶栏也有 **交接到本地 / 交接到隔离**（对标 Codex Hand off in the chat header）。隔离可先选 **起点分支**（默认 HEAD）。仓库根目录 `.worktreeinclude` 列出的、且已被 gitignore 的文件（以及 `AGENTS.override.md`）会在创建时拷进新 worktree。侧栏把正在跑的线程单独列在 **进行中**，便于并行监督；对话旁可按时间 / 进行中 / 等待回复 / 未读 / 置顶筛选（找不到时选「按时间」）。筛选菜单在有未读时可 **全部标为已读**（只清对话未读；`⇧Esc` 仍同时清审查队列）。侧栏铃铛或 `⌘⌥U` 开关 Activity（默认等待审批回复，对标 Codex Activity）。`⌘⌥A` 先切到等你回复的对话，再切进行中。空输入连按 Esc 回编上一条用户气泡并分叉。托管 worktree 默认建在 `~/.sharker/worktrees`（设置 → 权限 → Worktree 根目录可改绝对路径，对标 Codex Worktree root；改了不搬旧目录），默认只保留最近 15 个（0 为不自动删），删除前会快照未提交文件；目录被清理后输入区显示恢复横幅，再发送或点恢复会从快照重建。归档对话会清掉对应托管 worktree。`/init` 在仓库根写 `AGENTS.md`，`/memories` 可开关注入与写入。`/copy` 或 Ctrl+O 复制上一条助手回复，`/delete` 删除当前对话，`/theme` 打开外观，`/debug-config` 打印本机配置（不含 Key），直播中 Esc 停止当前回合，`/fast` 降思考档位，`/skills` 打开 Skill 选择器（带过滤参数则列出匹配项），`/stop` 中止回合并关掉集成终端。`/approve` 批准重试最近一次被拒操作（一次，对标 Codex）；`/rename [标题]` 或 ⌘⌥R / 侧栏双击写入 `customTitle`；`/pin` 或 ⌘⌥P 置顶；`/unread` 或 ⌘⇧U 标未读（打开对话或 ⇧Esc 清除）；`/usage daily|weekly|cumulative` 看本机 Token 用量；设置 → 用量或命令面板「打开用量」看终身 Token、峰值日、连续活跃与近 14 日单色火花图（对标 Codex Profile，不假装供应商额度或最长任务）；`sharker://settings/usage|profile|tokens` 打开该页；⌘⌥O / ⌘⌥N 独立新对话（弹出窗、不拷目标、不切走当前线程；对标 Codex Quick chat）；⌘⌥⇧O 打开项目选择器；⌘⇧C 复制工作目录（内置浏览器聚焦时仍复制网址）；⌘⌥C 复制会话 ID；⌘⌥⇧C 复制对话路径（隔离 worktree 优先，否则工作区 cwd）。查找栏打开时 ⌘G / ⌘⇧G / F3 / ⇧F3 跳到下一条/上一条命中。审批打开时 Enter 允许一次、Esc 拒绝（输入框菜单优先）。Ctrl+Y 重做应用操作；⌘+ / ⌘- / ⌘0 也认小键盘。行首 `!command` 打开右侧终端直接执行。⌘⇧O 与 ⌘N 一样新建对话。`/task` 在全局工作区开无项目新对话。项目三点菜单可 **创建永久 worktree**（独立项目，不自动删）。

### 线程内查找

`⌘F` 或命令面板「在对话中查找」：在当前线程消息里定位（大小写不敏感），Enter / ↑↓ 跳转。有正文划选时预填查找词（对标 Codex Find starts with current text selection）。查找栏打开时 `⌘G` / `⌘⇧G` / `F3` / `⇧F3` 跳下一条 / 上一条（对标 Codex Find next），此时不打开「搜索对话」。不注册为全局工作台快捷键，避免抢走普通输入框的查找。集成终端按线程保留，并可在同一线程开多个标签（对标 Codex terminal tabs per thread）；`!command` 与清屏只作用于当前标签。

### 人格

设置 → 外观，或 `/personality [pragmatic|friendly|none]`（对标 Codex Pragmatic / Friendly / None；旧 `empathetic` 读成友好）。只改回复语气，不改工具与权限。默认务实。

### 自动化审查队列

定时任务到期后**新建对话**并优先在隔离 Git worktree 里后台跑（对标 Codex 无人值守隔离），结果进入侧栏 **审查队列**（未读徽标）。可 **接受**（只暂存并提交该任务改过的文件，再尝试推送；若当前分支还没有 PR 则 `gh pr create`。推送/开 PR 失败不回滚提交，可在审查面板重试）、**修订**（打开线程继续改）、**拒绝**（只还原该任务改过的文件并归档）。没有记录到路径时不碰工作区其它脏文件。不打断当前线程。对标 Codex Triage。

`/review` 结束时会解析 `review-findings` 围栏，把发现挂到审查 diff 对应行上（与人手评论一起发送）。

当前分支若已有 GitHub PR 且本机 `gh` 已登录，审查面板会拉取行内审查评论（对标 Codex PR Chat），可 **打开** PR 或 **处理评论**（把 `@login: 正文` 派进当前线程）。本地行内评论可 **发布到 GitHub**（`gh api` 写回 PR）。顶栏会显示 **PR #n** 芯片，点开审查面板。未安装 `gh` / 没有 PR 时不报错、不显示横幅或芯片。

### 命令面板

`⌘K` / `⌘⇧P` 打开命令面板；`⌘/` 打开快捷键一览。`⌘[` / `⌘]` 前进后退页面与对话（与 `⌘⇧[` / `⌘⇧]` / `⌃Tab` / `⌃⇧Tab` 切相邻线程分开；内置浏览器聚焦时不抢 ⌃Tab）；`⌘+` / `⌘-` / `⌘0` 放大、缩小、重置界面字号（写入设置 → 外观，主进程锁定 pinch 缩放以免只改视图比例）。`Ctrl+L` 打开并清集成终端；终端聚焦时 `⌘K` 也清屏（对标 Codex，此时不打开命令面板；`⌘⇧P` 仍开）。`⇧Esc` 把审查队列未读标成已读。`⌘⇧A` 归档当前对话，`⌘⌥S` 旁路新线程，`⌘⌥A` 跳到下一条需要关注的对话（先等审批），`⌘P` 打开 `@` 文件搜索（对标 Codex Search files），`⌘T` 打开内置浏览器标签；右侧面板打开时 `⌘W` 先关面板（不关窗）。浏览器聚焦时 `⌘L` 选中地址栏、`⌘R` 刷新、`⌘←` / `⌘→` 前进后退、`⌘⇧C` 复制网址。鼠标侧键后退 / 前进（浏览区内走网页历史，其它区域走工作台历史）。`⌘⇧[` / `⌘⇧]` 或 `⌘1–9` 切换当前项目对话；`⌘G` 搜索对话（对标 Codex Search chats expanded matching：标题、正文摘要、git 分支如 `fix/login-redirect`）；`⌘⌥⇧O` 或 `/project` 打开项目选择器；`⌘Z` / `⌘⇧Z` 撤销/重做上一次应用操作（归档、置顶、重命名、未读；输入框内仍是文本撤销）；`⌃⇧G` 打开审查（对标 Codex Open review tab）；`⌘⇧E` 文件树、`⌘⇧B` 浏览器、`⌘⌥U` 活动视图、`⌘⌥⇧U` / `/agents` 子 Agent 活动、`Ctrl+\`` 终端、`Ctrl⇧M` 模型选择。长对话在消息区 `⌘↑` / `⌘↓` 跳到顶/底（输入框内不抢光标）。Composer 麦克风或 `Ctrl⇧D` 听写（Web Speech API，对标 Codex Dictation）；`Ctrl⇧V` 或「语音」进入语音对话（听写自动发送，回复用系统 TTS 朗读）。顶栏可 **弹出当前对话** 到独立窗看直播（chunk 广播到所有窗）。空输入时 `↑` 恢复刚提交或上一条用户提示（对标 Codex：取消运行或取消 worktree 创建后，即使提示还没进对话也能按 ↑ 找回）。Composer 粘贴优先走 `text/plain`（及剥过的 HTML），避免 Word / PowerPoint 剪贴板把正文收成图片；超过约 1.6 万字收成 `Pasted text.txt`，可预览或「插入正文」。空输入或 `/goal` 无参数时把该附件折成真正的请求。用户气泡可编辑后从该条重发。后台线程完成会标未读并按设置 → 外观 → **通知**（从不 / 后台 / 始终，对标 Codex Notifications）弹系统通知；默认后台档在正在看且窗口在前台时不打扰。可打开 **运行时防止休眠**（主进程 `powerSaveBlocker`）与 **新弹出对话置顶**；弹出窗顶栏可再切 Always on top。完成后助手消息显示 **已改 N 个文件**（写入 `meta.changedFiles`，点开审查；通知正文也带改文件数）。Dock 徽标只计本机未读对话。`sharker://threads/new`、`sharker://new?prompt=` / `path=` / `originUrl=`、`sharker://threads/<id>`、`sharker://settings`、`sharker://skills`、`sharker://automations` 打开对应本机界面（自动化深链同时打开创建流；不自动发送 prompt；不实现 Cloud plugins / pets / SSH）。`/reasoning [档位]` 查看或设定思考档（对标 Codex `/reasoning`）。`/task` 在全局「对话」工作区开新聊天（不绑定项目，对标 Codex `/task`）。`/model` 打开模型选择（也可带模型名直接切）。⌘⌥L 或命令面板复制当前对话深链。macOS 菜单栏提供文件 / 编辑 / 显示 / 窗口 / 帮助（自定义项不抢渲染进程快捷键）。

### 排队与插队

- 设置 → 外观 → **后续行为**（对标 Codex Settings → General → Follow-up behavior）：默认 **排队**，忙时 Enter 等到当前回合结束；也可改成 **注入**（中止并立即执行）
- **⌘⇧Enter** 对单条消息使用另一种行为；**Tab** 始终排队
- 设置 → 外观 → **Enter 发送**（对标 Codex `chatgpt.composerEnterBehavior`）：**回车发送** / **多行需 ⌘Enter** / **始终 ⌘Enter**；旧「用 ⌘Enter 发送」读成始终 ⌘Enter
- 可打开 **建议提示**（空对话显示审查 / 设定目标 / 继续最近对话，对标 Codex Suggested prompts）
- 设置 → 权限 → Git **审查交付**：`/review` 默认独立线程或当前对话（对标 Codex Review delivery）
- 设置 → 权限 → Git **Commit / PR 文案模板**：写入 system 与 `git-commit` skill（对标 Codex Git commit/PR prompts）
- 设置 → 权限 → Git **始终 force-with-lease 推送**（默认关）：审查面板 `git push --force-with-lease`，从不 `--force`（对标 Codex Always force push）
- 设置 → 权限 → Git **分支名前缀**：审查面板与 agent 新建分支时自动加上（对标 Codex Git branch naming）
- 设置 → 权限 → **项目与终端 / 命令输出**：简要 / 标准 / 详细（对标 Codex how much command output appears in chats）；标准只画输出尾部，详细完成后才默认展开，直播中仍折叠以免贴底跳动
- 设置 → 权限 → Worktree **根目录**（对标 Codex Worktree root）：托管与永久 worktree 建在此绝对路径下，空则 `~/.sharker/worktrees`；`sharker://settings/worktrees` 打开该页。改了不搬旧目录
- 项目三点菜单 **编辑项目**（对标 Codex Edit project）：主文件夹负责新对话 / Git / AGENTS.md / Skill；附加文件夹可供右侧文件树浏览、`@` 搜索、文件引用跳转与沙箱读写，不改 Git 根
- 设置 → 外观 → **代码字体 / 代码字号**（对标 Codex Code font / Code font size）：审查、终端与对话代码共用 `--mono` 与 `--code-font-scale`；`sharker://settings/code-font` 打开该页。只换等宽栈与代码字号，不改主题色，不跟 ⌘+ / ⌘- 界面字号走
- 设置 → 外观 → **通知**（从不 / 后台 / 始终）、**批准通知**、**系统通知权限**、**运行时防止休眠**、**新弹出对话置顶**（对标 Codex Notifications / Prevent sleep / Always on top）
- 设置 → 外观 → **记忆** 注入/写入（对标 Codex Settings → Personalization；`/memories` 仍打印本机记忆清单）
- 设置 → 外观 → **自定义说明** 写入 `~/.sharker/AGENTS.md`（对标 Codex Personalization → Custom instructions；不改 `~/.codex`，不覆盖 `AGENTS.override.md`）
- 设置 → **用量**（对标 Codex Settings → Profile）：本机终身 Token / 回合、峰值日、连续活跃、近 14 日 Token 活动；没有最长任务时长或供应商额度
- 对话附件与正文渲染图可悬停 **复制** 或 **保存**（对标 Codex Save or copy rendered images）；只认本机附件、http(s) 与 `data:image`，不读任意 `file://`
- 闭合的 ```mermaid / ```mmd 围栏在对话里内联成图（对标 Codex transcript Mermaid）；未闭合直播仍显示代码尾，避免每 token 重绘；解析失败回退代码块；按主题缓存 SVG，收束重挂时首帧仍是图，避免闪回源码
- 对话与直播正文里的本地文件引用（`src/foo.ts:12`、`#L12`、`` `foo.ts` ``、`(line N)`）可点开右侧文件预览并跳到该行（对标 Codex View Code）
- 直播思考默认折叠成「思考中」（对标 Codex Thought），点开才看旁白，避免增长正文把回答顶下去；散文尾廉价画 GFM 表格（含单列、无两侧 `|`、分隔行未到先画表；`table-layout:fixed` 锁在对话柱内）、任务列表、`1)` / `ol start` 有序列表、项内引用 / 标题 / HR / 嵌套围栏 / 缩进代码（嵌套层自己松）、无引用脚注定义不画、引用懒续行硬换行、空 dest / 锚点 / 相对链接、危险协议清空、未闭合 `](` 先画链接、未闭合 `**` / `*` / `~~` / `~` / `` ` `` / `***` / `<https://` / `<email@` / `[^id` 先画标记、GFM 单 `~` 删除线、完整 `<!-- -->` 不画、http 图、分隔线（含 `* * *`）、Setext / 行尾 `#` 标题、下划线强调、引用式链接 / 图片（含相对 dest）、dest 内成对括号、可点图 `[![img]](url)`、多反引号代码、链接标签内强调、HTML 实体、`www.` / 邮箱、脚注、硬换行（含列表续行与 `\\\n`）与缩进代码，并复用已闭合列表项/表格行；`[label][id]` 不再吞掉后面的标记；廉价尾与收束后共用块边距 / 任务列表 class，直播围栏长行在对话柱内换行以免横向撑开，正文出现后收起命令输出，并把过程收成「工作中 / 工作了」（对标 Codex Worked for，点开才看步骤；审批/失败仍露出；回答刚上屏时收回已展开的 Thought / Worked for，避免过程区在直播回答上方突然长高），贴底在布局后同帧写 scrollTop
- Composer `@` 统一引用文件 / 对话 / Skill（对标 Codex @ menu skills）；输入里的 `$name` 在发送前显示芯片，点掉即撤引用（对标 See skills inline before sending）
- 切换对话或工作区时恢复未发送的输入与附件（对标 Codex restore unsent prompts when switching tasks）；发送或 slash 后清掉该会话草稿
- 排队消息出现在输入框上方，可编辑、重排、立即发送或删除（不进对话滚动区，避免直播贴底跳动）
- 当前 turn 结束后默认按序执行下一条；可点 **暂停队列** 先审再继续（对标 hold queue）
- Composer 「注入」按钮始终注入当前回合

---

## 一、已有工具（现在就能用）

### 看 · 搜

| 工具 | 能做什么 |
|------|----------|
| `list_dir` | 列目录（可指定深度） |
| `glob_file_search` | 按文件名模式找文件 |
| `grep` | 在目录下搜文本（结果截断 200 行） |
| `read_file` | 读文件（支持 offset/limit） |

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
| `run_terminal_cmd` | bash 执行命令（`rm` 后自动验证路径；cwd 锁在工作区） |
| `read_thread_terminal` | 读当前对话集成终端当前标签的输出尾（对标 Codex inspect terminal；不请用户粘贴） |

### Git / Tasks / Sub-agents

见 `tools/ARCH.md` 完整列表。`agent_spawn` 会按**父线程**归组，不进侧栏对话列表（对标 Codex 不把 child 当顶层会话）。右侧 **活动** 面板（`⌘⌥⇧U` / `/agents`）可看进行中/已结束、直播正文、停止与转向。启动子 Agent 时自动打开该面板。主线程时间线里的启动子 Agent / 转向 / 取结果步骤可点 **打开**，选中对应孩子（对标 Codex「Open a subagent thread from the activity shown in the main thread」）。快照落 `~/.sharker/subagents.json`，重启后仍能查看已结束的孩子；启动时仍在跑的标为「应用重启后中断」。

### 子 Agent 活动

对标 Codex Activity / Subagents：只挂在当前对话下；审批沿用父 turn，避免权限请求丢失。可从主线程活动点开；重启后从磁盘恢复。

### Web

| 工具 | 说明 |
|------|------|
| `web_fetch` | HTTP 抓取 + 粗略 HTML→文本 |
| `web_search` | DuckDuckGo Instant Answer |
| `open_url` | 在用户的系统浏览器 / Chrome 中可见地打开 URL（用户明确要求打开网站时） |
| `present_inline_demo` | 把自包含 HTML/CSS/JS **嵌进对话**做演示；教学/可视化请用此工具，不要写文件再开浏览器 |

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
4. 点击/打字需用户在审批块点「允许一次」

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
| 上下文压缩 | 用量超 85% 自动摘要 |
| 自动验证 | 改代码后自动 test/build/lint |
| Plan/Build | enter_plan_mode → Build 按钮 → 全工具 |
| 续跑提醒 | 对可执行任务，若模型停在启动服务器/打开/检查等中间话术但没有工具调用，会继续 nudging 直到完成或遇到真实阻塞 |

---

## 三、与 Codex Desktop 对照（Gap Matrix）

| Codex 功能 | Sharker 状态 | 说明 |
|------------|--------------|------|
| Coding 看搜改跑 | **done** | read/write/grep/terminal/git/verify |
| Plan 模式 | **done** | enter_plan_mode + PlanBuildBar |
| @file 引用 | **done** | `@path` 注入 |
| 并行只读工具 | **done** | query-loop Promise.all |
| Computer Use 设置 UI | **done** | 设置 → Computer Use（环境检查） |
| Browser Use | **partial** | builtin browser_*（Playwright）；可选 native host |
| Computer Use macOS | **partial** | screencapture/cliclick `desktop_*` |
| 视觉截图回灌 | **done** | agent/vision-feedback.ts + Provider vision 开关 |
| Accessibility 窗口树 | **partial** | `desktop_get_ui_tree` / `desktop_list_windows` |
| Agent Workspace 隔离 | **partial** | networkMode MVP |
| Voice STT/TTS | **partial** | voice_* 本地 say；无 conversation-mode STT 循环 |
| Read Aloud / Kokoro | **deferred** | 可选 install-kokoro-runtime.sh |
| Chrome 扩展 + native host | **deferred** | 可选 scripts/setup-browser-use.sh |
| Remote Control / Mobile | **deferred** | 需 Secure Enclave 替代 + app-server 守护 |
| 编辑快照/撤销 | **missing** | 路线图 |
| `.sharker/AGENTS.md` | **done** | 全局 `~/.sharker` + 根到 cwd；`/init` 脚手架；override 优先 |

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
