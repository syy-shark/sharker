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
| `index.ts` | 主进程入口：窗口、菜单、IPC、`chat:send` → `executeUserInput`（可选 worktreePath / goal）、`/init` 写 AGENTS.md、记忆列表、worktree 探活、记忆初始化、子 Agent 落盘恢复、`/approve` 一次重试等；窗口锁定 pinch 缩放，字号走 `--ui-font-scale` |
| `terminal-manager.ts` | node-pty 会话：创建/读写/关闭集成终端 |
| `automation-scheduler.ts` | 读取 `~/.sharker/automations.json`（jobs + 审查队列），按 cron 触发任务 |
| `ARCH.md` | 本层架构说明 |
