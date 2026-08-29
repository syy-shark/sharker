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
| `AppearanceSettings.tsx` / `.css` | 外观：浅色玻璃 / 深色金属；界面字号（`uiFontScale` / `--ui-font-scale`）；代码字号（`codeFontScale` / `--code-font-scale`，对标 Codex Code font size）；代码字体（`codeFont` / `--mono`，对标 Codex Code font）；新弹出置顶 |
| `NotificationSettings.tsx` / `.css` | 通知：回合完成档 / 批准通知 / 系统通知权限（对标 Codex Settings → Notifications） |
| `GeneralSettings.tsx` | 通用：后续排队/注入、Enter 发送、/review 交付、运行防休眠（对标 Codex Settings → General） |
| `SuggestedPromptSettings.tsx` | 建议提示开关（对标 Codex Settings → Suggested prompts） |
| `PersonalizationSettings.tsx` / `.css` | 个性化：启用记忆（官方默认关）+ 注入/写入、人格、个人 `~/.sharker/AGENTS.md`（对标 Codex Settings → Personalization Enable memories；单对话 `/memories` 覆盖） |
| `ShortcutSettings.tsx` / `.css` | 键盘快捷键：搜索、按键筛选、改绑、解除（空串解绑，录制时 Backspace 也可）、重置（`keyboardShortcuts`；含停止当前回合） |
| `ModelsSettings.tsx` / `.css` | 模型与 Provider（含 OpenCode Go 套餐 Key）、思考水平、测试连接 |
| `PermissionsSettings.tsx` | 权限模式、网络隔离、Git 文案 / force-with-lease / 分支前缀、命令输出展示量、Worktree 根目录与托管保留数 |
| `ArchivedSettings.tsx` / `.css` | 已归档对话：回档或彻底删除（含项目菜单一并归档的对话） |
| `UsageSettings.tsx` / `.css` | 用量：本机终身 Token / 回合、峰值日、连续活跃、近 14 日单色火花图（对标 Codex Profile，不假装最长任务或供应商额度） |
| `ComputerUseSettings.tsx` | Computer Use 开关与就绪（设置入口暂隐藏） |
| `BrowserUseSettings.tsx` | Browser Use 开关与就绪（设置入口暂隐藏） |
| `FeatureStatusPanel.tsx` / `.css` | 功能检查列表（共用）；项进入 list-item-in |
| `ARCH.md` | 本层架构说明 |

> 本层交互控件补齐 `:focus-visible` 与 `prefers-reduced-motion` 收敛。
