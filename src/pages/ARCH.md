# src/pages — 整页路由

## 职责

- 设置、自动化、Skills 等整页壳（聊天主界面在 `App` + `ChatView`，不在此）

## 同级目录

（无子目录）

## 同级文件

| 文件 | 说明 |
|------|------|
| `SettingsPage.tsx` / `.css` | 设置页壳：Permissions / 模型 / MCP servers / General / Worktrees / Browser / Appearance / Notifications / Personalization / Suggested prompts / Keyboard Shortcuts / Appshots / Archived chats / Profile；Worktrees 对标 Codex Settings → Worktrees；Appshots 对标 learn.chatgpt.com/docs/appshots；General / Notifications / Personalization / Suggested prompts / Archived chats / Keyboard Shortcuts 页说明用官方 Settings 原文（本机洞察，不假装最长任务） |
| `AutomationsPage.tsx` / `.css` | Scheduled 页 + Codex 式审查队列（接受 / 修订 / 拒绝 / 打开线程）；说明用官方 Find all scheduled tasks… / The Scheduled view acts as your inbox…；返回 ← Chats；All / Active / Paused 筛选与 Run now（对标 Codex desktop Scheduled）；队列 **Mark all as read** / **Archive eligible runs**（nowrap）；目标可选每次新对话（环境：隔离 worktree / 本地项目，可勾选多个项目）或回到指定对话沿用上下文；Cron 或 RFC 5545 RRULE；模型 / 思考可跟随当前或显式指定；开关/删除即时持久化；`queueRevision` 在 ⇧Esc 清未读后刷新；`openCreateNonce` 打开创建流（深链 `sharker://automations`） |
| `SkillsPage.tsx` / `.css` | 侧栏 Skills：说明用官方 Open Skills in the sidebar to view and explore skills created across your projects.；返回 ← Chats；过滤后点选写入 `$name`；命令面板 **Force reload skills** 用 `reloadNonce` 重扫盘上 SKILL.md（对标 Codex open Skills in the sidebar / packaged `forceReloadSkills`；深链 `sharker://skills`） |
| `ARCH.md` | 本层架构说明 |
