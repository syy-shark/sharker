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
| `index.ts` | 主进程入口：窗口、菜单、IPC、`chat:send` → `executeUserInput`、记忆初始化等 |
| `terminal-manager.ts` | node-pty 会话：创建/读写/关闭集成终端 |
| `automation-scheduler.ts` | 读取 `~/.sharker/automations.json`，按 cron 触发任务 |
| `ARCH.md` | 本层架构说明 |
