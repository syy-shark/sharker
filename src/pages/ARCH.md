# src/pages — 整页路由

## 职责

- 设置、自动化等整页壳（聊天主界面在 `App` + `ChatView`，不在此）

## 同级目录

（无子目录）

## 同级文件

| 文件 | 说明 |
|------|------|
| `SettingsPage.tsx` / `.css` | 设置页壳：权限（含 Git Review delivery 与 commit/PR 文案） / 模型 / 外观 / 键盘快捷键 / 已归档 / 用量（本机 Profile 洞察） |
| `AutomationsPage.tsx` / `.css` | 自动化任务列表 + Codex 式审查队列（接受 / 修订 / 拒绝 / 打开线程）；无人值守优先隔离 worktree；开关/删除即时持久化；`queueRevision` 在 ⇧Esc 清未读后刷新；`openCreateNonce` 打开创建流（深链 `sharker://automations`） |
| `ARCH.md` | 本层架构说明 |
