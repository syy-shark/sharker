# electron/main — 主进程入口

## 职责

- Electron 应用生命周期、窗口创建
- 注册全部 IPC handler，调度 Agent 对话与各类桌面能力
- 集成终端 PTY、自动化 cron 调度

## 同级目录

（无子目录）

## 同级文件

| 文件 | 说明 |
|------|------|
| `index.ts` | 主进程入口：窗口、菜单、IPC、`chat:send` → `executeUserInput`（可选 worktreePath / goal）、`/init` 写 AGENTS.md、个人 `~/.sharker/AGENTS.md` 读写、按会话计划模式读写（芯片不发消息）、记忆列表、worktree 探活与创建（读设置 `worktreeRoot` / 保留数，不信渲染进程根路径）、记忆初始化、子 Agent 落盘恢复、`/approve` 一次重试、对话元数据补丁（重命名/置顶/未读）、旁路/独立窗 `createConversation({ activate: false })`、图片/文本附件落盘、后台回合 `Notification` 与 Dock 徽标、设置页申请通知权限、`sharker://` 深链、弹出窗 Always on top、`powerSaveBlocker` 防休眠、Git 推送读 `gitForceWithLease`、创建分支读 `gitBranchPrefix`、文件树 `WORKSPACE_TREE` 可带附加根等；窗口锁定 pinch 缩放，字号走 `--ui-font-scale` |
| `app-menu.ts` | macOS 应用菜单（File / Edit / View / Window / Help）；撤销/重做走渲染进程（输入框原生、其它处应用动作）；自定义项 `registerAccelerator: false` |
| `terminal-manager.ts` | node-pty 会话：创建/读写/关闭集成终端 |
| `automation-scheduler.ts` | 读取 `~/.sharker/automations.json`（jobs + 审查队列），按 cron 触发任务 |
| `ARCH.md` | 本层架构说明 |
