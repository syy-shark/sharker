# src/pages — 整页路由

## 职责

- 设置、自动化、Skills 等整页壳（聊天主界面在 `App` + `ChatView`，不在此）

## 同级目录

（无子目录）

## 同级文件

| 文件 | 说明 |
|------|------|
| `SettingsPage.tsx` / `.css` | 设置页壳：权限（含 Git、命令输出展示量、worktree） / 模型 / MCP 服务器（STDIO / Streamable HTTP） / 通用（含 `file_opener` 与上下文用量环） / 浏览器（历史与清除，对标 Codex Settings → Browser） / 外观 / 通知 / 个性化（启用记忆默认关） / 建议提示 / 键盘快捷键 / 已归档 / 用量（本机 Profile 洞察） |
| `AutomationsPage.tsx` / `.css` | 自动化任务列表 + Codex 式审查队列（接受 / 修订 / 拒绝 / 打开线程）；全部 / 进行中 / 已暂停筛选与立刻跑（对标 Codex Scheduled All / Active / Paused / Run now）；队列可全部标为已读或归档已处理运行；目标可选每次新对话（环境：隔离 worktree / 本地项目，可勾选多个项目）或回到指定对话沿用上下文；Cron 或 RFC 5545 RRULE；模型 / 思考可跟随当前或显式指定；开关/删除即时持久化；`queueRevision` 在 ⇧Esc 清未读后刷新；`openCreateNonce` 打开创建流（深链 `sharker://automations`） |
| `SkillsPage.tsx` / `.css` | 侧栏 Skills：跨项目浏览已安装 Skill，过滤后点选写入 `$name`（对标 Codex open Skills in the sidebar；深链 `sharker://skills`） |
| `ARCH.md` | 本层架构说明 |
