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
| `AppearanceSettings.tsx` / `.css` | 外观：浅色玻璃 / 深色金属；界面字号（`uiFontScale` / `--ui-font-scale`）；人格（务实/共情/关闭） |
| `ShortcutSettings.tsx` / `.css` | 键盘快捷键：搜索、按键筛选、改绑、重置（`keyboardShortcuts`） |
| `ModelsSettings.tsx` / `.css` | 模型与 Provider（含 OpenCode Go 套餐 Key）、思考水平、测试连接 |
| `PermissionsSettings.tsx` | 权限模式、网络隔离、记忆注入/写入、托管 worktree 保留数 |
| `ComputerUseSettings.tsx` | Computer Use 开关与就绪（设置入口暂隐藏） |
| `BrowserUseSettings.tsx` | Browser Use 开关与就绪（设置入口暂隐藏） |
| `FeatureStatusPanel.tsx` / `.css` | 功能检查列表（共用）；项进入 list-item-in |
| `ARCH.md` | 本层架构说明 |

> 本层交互控件补齐 `:focus-visible` 与 `prefers-reduced-motion` 收敛。
