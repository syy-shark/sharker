# src/components/settings — 设置子面板

## 职责

- 设置页各功能 Tab 与可复用表单原语
- 由 `pages/SettingsPage.tsx` 组合

## 同级目录

（无子目录）

## 同级文件

| 文件 | 说明 |
|------|------|
| `SettingsPrimitives.tsx` / `.css` | Section / Card / Row / Toggle / 选择组等 |
| `SettingsSelect.tsx` / `.css` | 自定义下拉；portal 菜单 + usePopoverAnimation 180ms enter/exit 后卸载；Esc/外侧关闭 |
| `AppearanceSettings.tsx` / `.css` | 外观：浅色玻璃 / 深色金属；界面字号（`uiFontScale` / `--ui-font-scale`）；代码字号（`codeFontScale` / `--code-font-scale`，档位标题仍本机）；代码字体行用官方 Code font（`codeFont` / `--mono`）；Reduce Motion（关掉直播思考扫光，进度圈仍转，对标 Codex #16857 / #22787）；Keep a chat near your work / Always on top（对标 Codex Settings；说明用官方 pop out an active chat… Always on top 原文） |
| `NotificationSettings.tsx` / `.css` | Notifications：分区说明用官方 Choose when turn completion notifications appear… / turn-completion alerts appear never, only while ChatGPT is in the background, or always；档标题官方 Never / Only while ChatGPT is in the background / Always；批准通知 / 系统通知权限行标题仍本机，说明用官方 Separate controls… / Your operating system may ask…（对标 Codex Settings → Notifications / learn.chatgpt.com/docs/notifications） |
| `GeneralSettings.tsx` | 通用：Follow-up behavior（选项标题官方 Wait for the next run / Steer the current run；说明用官方 Under Follow-up behavior… steer the current run or wait for the next run，以及 Queue saves… / Steer adds… / Queued messages appear above the composer；Composer 芯片仍 Queue / Steer）、Enter always sends / Require Cmd+Enter for multiline prompts / The modifier is always required（对标 `chatgpt.composerEnterBehavior`）、Show context window usage 用量环（官方默认关）、Code review（分区说明用官方 Reviews run in the current chat by default… choose Detached；Inline / Detached 用官方 Run /review in the current chat… / Start a separate review chat）与审查模型（对标 Codex `review_model`）、Prevent sleep while running。`file_opener` 在 Permissions → Project and terminal behavior |
| `BrowserSettings.tsx` / `.css` | 设置 → 浏览器：历史搜索 / 重新打开 / 删除，按时间清除历史，Cookie / 缓存；下载开关用官方 Ask where to save downloads，清除分区/按钮用官方 Clear browsing data（对标 Codex Settings → Browser / learn.chatgpt.com/docs/browser）。不发明时间范围英文档名、@Browser / 导入系统配置 |
| `SuggestedPromptSettings.tsx` | Suggested prompts：分区说明用官方 Use context-aware suggestions…；行标题仍本机（对标 Codex Settings → Suggested prompts） |
| `PersonalizationSettings.tsx` / `.css` | 个性化：Memories 分区标题与说明用官方 Memories / Enable Memories, where available…；Enable memories（官方默认关，说明用 Local Codex memories are off by default / Don't store secrets in memories.）+ Use memories / Generate memories（官方 inject / memory-generation 说明）、Choose a personality（Pragmatic / Friendly / None，说明用官方 A personality changes how ChatGPT communicates…）、Custom instructions 写入个人 `~/.sharker/AGENTS.md`（说明用官方 Editing custom instructions updates your personal instructions in AGENTS.md. / Use custom instructions for preferences…；对标 Codex Settings → Personalization / learn.chatgpt.com/docs/personalize；单对话 `/memories` 覆盖） |
| `ShortcutSettings.tsx` / `.css` | Keyboard Shortcuts：页说明用官方 Open Keyboard Shortcuts to review… / Use the search field…；Search by command name / Keystroke search；未绑行 Not assigned by default；录制时 Press a key combination；一条命令多行绑定（New chat 的 ⌘N 与 ⌘⇧O 各一行）；改绑按钮 aria Change shortcut for {title}，按住 Shift 时 Create new shortcut for {title} 并追加（对标官方桌面打包文案 #27835 隐藏手势，不发明可见 Add another shortcut）；解除单行、重置整条（`keyboardShortcuts`；含 Stop / Open Subagents / `/copy` Copy the last response…；动作标题用官方 Commands / slash 文案；Search chats / Cycle reasoning 默认 Not assigned by default） |
| `AppshotSettings.tsx` | Appshots：分区说明用官方 Appshots let you send the frontmost app window… / Press both Command keys…；热键行 **Take an Appshot**，默认 ⌘+⌘，改绑用 Change shortcut for / Press a key combination（对标 learn.chatgpt.com/docs/appshots / Commands；不进 Keyboard Shortcuts 目录，不发明开关） |
| `ModelsSettings.tsx` / `.css` | 模型与 Provider（含 OpenCode Go 套餐 Key）、思考水平、测试连接 |
| `PermissionsSettings.tsx` | Permissions：Ask for approval / Full access（对标 Codex Settings → General → Permissions，不发明 Approve for me）、网络隔离、Git（官方 Use Git settings to standardize branch naming…）、Project and terminal behavior（官方 Choose where files open…；`file_opener` 与命令输出同区；档位标题仍用简要/标准/详细，不发明 Brief/Standard/Verbose） |
| `WorktreeSettings.tsx` | 设置 → Worktrees：Worktree root 与托管保留数（默认 15，0 关闭自动删除；对标 Codex Settings → Worktrees）。不发明环境编辑器或单独未落盘的自动删除开关 |
| `ArchivedSettings.tsx` / `.css` | Archived chats：Unarchive 或彻底删除（含项目菜单一并归档的对话） |
| `UsageSettings.tsx` / `.css` | Profile：本机终身 Token / 回合、峰值日、连续活跃、近 14 日单色火花图（对标 Codex Settings → Profile，不假装最长任务或供应商额度） |
| `McpSettings.tsx` / `.css` | MCP servers：列表、开关、空态用官方 Select Add server… / Save the server, then select Restart / type /mcp；Add server 表单 Name / Command / Save / Remove（对标 Codex Settings → MCP servers / learn.chatgpt.com/docs/extend/mcp；不假装 OAuth） |
| `ComputerUseSettings.tsx` | Computer Use 开关与就绪（设置入口暂隐藏） |
| `BrowserUseSettings.tsx` | Browser Use 开关与就绪（设置入口暂隐藏） |
| `FeatureStatusPanel.tsx` / `.css` | 功能检查列表（共用）；项进入 list-item-in |
| `ARCH.md` | 本层架构说明 |

> 本层交互控件补齐 `:focus-visible` 与 `prefers-reduced-motion` 收敛。
