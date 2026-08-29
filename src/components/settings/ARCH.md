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
| `AppearanceSettings.tsx` / `.css` | 外观：浅色玻璃 / 深色金属；界面字号（`uiFontScale` / `--ui-font-scale`）；代码字号（`codeFontScale` / `--code-font-scale`，对标 Codex Code font size）；代码字体（`codeFont` / `--mono`，对标 Codex Code font）；Reduce Motion（关掉直播思考扫光，进度圈仍转，对标 Codex #16857 / #22787）；Keep a chat near your work / Always on top（对标 Codex Settings；说明用官方 pop out an active chat… Always on top 原文） |
| `NotificationSettings.tsx` / `.css` | Notifications：回合完成档 / 批准通知 / 系统通知权限（对标 Codex Settings → Notifications；分区标题用官方 Notifications） |
| `GeneralSettings.tsx` | 通用：Follow-up behavior（Queue / Steer）、Enter always sends / Require Cmd+Enter for multiline prompts / The modifier is always required（对标 `chatgpt.composerEnterBehavior`）、`file_opener` 默认打开位置、Show context window usage 用量环（官方默认关）、/review 交付与审查模型（对标 Codex `review_model`）、Prevent sleep while running |
| `BrowserSettings.tsx` / `.css` | 设置 → 浏览器：历史搜索 / 重新打开 / 删除，按时间清除历史，Cookie / 缓存，以及下载位置与每次询问保存（对标 Codex Settings → Browser）。不发明 @Browser / 导入系统配置 |
| `SuggestedPromptSettings.tsx` | Suggested prompts 开关（对标 Codex Settings → Suggested prompts） |
| `PersonalizationSettings.tsx` / `.css` | 个性化：Enable memories（官方默认关，说明用 Local Codex memories are off by default）+ Use memories / Generate memories（官方 inject / memory-generation 说明）、Choose a personality（Pragmatic / Friendly / None）、Custom instructions 写入个人 `~/.sharker/AGENTS.md`（对标 Codex Settings → Personalization / learn.chatgpt.com/docs/personalize；单对话 `/memories` 覆盖） |
| `ShortcutSettings.tsx` / `.css` | Keyboard Shortcuts：Search by command name / Keystroke search、改绑、解除（空串解绑，录制时 Backspace 也可）、重置（`keyboardShortcuts`；含停止当前回合；动作标题用官方 Commands 文案；页说明用官方 Open Keyboard Shortcuts to review…） |
| `ModelsSettings.tsx` / `.css` | 模型与 Provider（含 OpenCode Go 套餐 Key）、思考水平、测试连接 |
| `PermissionsSettings.tsx` | Permissions：Ask for approval / Full access（对标 Codex Settings → General → Permissions，不发明 Approve for me）、网络隔离、Git 文案 / force-with-lease / 分支前缀、命令输出展示量、Worktree 根目录与托管保留数 |
| `ArchivedSettings.tsx` / `.css` | Archived chats：Unarchive 或彻底删除（含项目菜单一并归档的对话） |
| `UsageSettings.tsx` / `.css` | Profile：本机终身 Token / 回合、峰值日、连续活跃、近 14 日单色火花图（对标 Codex Settings → Profile，不假装最长任务或供应商额度） |
| `McpSettings.tsx` / `.css` | MCP servers：列表、开关、Add server（STDIO / Streamable HTTP 用官方传输说明）、Restart（对标 Codex Settings → MCP servers / learn.chatgpt.com/docs/extend/mcp；不假装 OAuth） |
| `ComputerUseSettings.tsx` | Computer Use 开关与就绪（设置入口暂隐藏） |
| `BrowserUseSettings.tsx` | Browser Use 开关与就绪（设置入口暂隐藏） |
| `FeatureStatusPanel.tsx` / `.css` | 功能检查列表（共用）；项进入 list-item-in |
| `ARCH.md` | 本层架构说明 |

> 本层交互控件补齐 `:focus-visible` 与 `prefers-reduced-motion` 收敛。
