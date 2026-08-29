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
| `index.ts` | 主进程入口：窗口、菜单、IPC、`chat:send` → `executeUserInput`（可选 worktreePath / goal / providerId / thinkingLevel / inAppBrowserUrl）、`chat:steer` 注入当前回合、`/init` 写 AGENTS.md、个人 `~/.sharker/AGENTS.md` 读写、按会话计划模式读写（芯片不发消息）、记忆列表、worktree 探活与创建（读设置 `worktreeRoot` / 保留数，不信渲染进程根路径）、记忆初始化、子 Agent 落盘恢复、`/approve` 一次重试、`user-input:response` Ask User 作答（Stop 拒绝未完成等待）、对话元数据补丁（重命名/置顶/未读）、旁路/独立窗 `createConversation({ activate: false })`、图片/文本/源码附件落盘、对话渲染图复制到剪贴板 / 另存、后台回合 `Notification` 与 Dock 徽标、设置页申请通知权限、`sharker://` 深链、`automations:run-now` 立刻跑定时任务、弹出窗 Always on top、`powerSaveBlocker` 防休眠、Git 推送读 `gitForceWithLease`、创建分支读 `gitBranchPrefix`、`GIT_INIT` 就地建仓、`GIT_LIST_BRANCHES` 列本地 + 远程跟踪分支（composer 起点搜索）、`GIT_STATUS_CHANGES` 带回 toplevel / commonDir / numstat（审查跨仓选择器）、`SHOW_ITEM_IN_FOLDER` 在访达中显示（对标 Codex Open in Finder）、内置浏览器 `persist:sharker-browser` 的 `will-download`（系统 Downloads / 自选目录 / 每次询问，对标 Codex Settings → Browser downloads）、文件树 `WORKSPACE_TREE` 可带附加根等；窗口锁定 pinch 缩放，字号走 `--ui-font-scale` |
| `app-menu.ts` | macOS 应用菜单（File / Edit / View / Window / Help）；应用菜单 Open settings、文件菜单 New chat / New standalone chat / Open folder / Share（对标 Codex Commands / Share，不发明 Quick chat）以及 Copy as Markdown（对标 Codex Copy as Markdown）；View 用官方 Toggle sidebar / Toggle bottom panel / Toggle terminal / Toggle review panel / Open review tab / Toggle File Tree（对标 #20552）；Help 用 Open command menu / Open keyboard shortcuts；撤销/重做走渲染进程（输入框原生、其它处应用动作）；自定义项 `registerAccelerator: false` |
| `terminal-manager.ts` | node-pty 会话：创建/读写/关闭；按对话写入输出尾、绑定/激活标签 |
| `automation-scheduler.ts` | 读取 `~/.sharker/automations.json`（jobs + 审查队列），读写时归一化 `destination` / `conversationId` / `rrule` / `workspaceIds`，按 cron 或 RFC 5545 RRULE 触发任务；`triggerAutomationRun` 立刻跑一条并写 `lastRunAt`（对标 Codex Run now） |
| `automation-scheduler.test.ts` | cron 通配 / 步进仍从调度器再导出 |
| `ARCH.md` | 本层架构说明 |
