# src/lib — 前端工具函数

## 职责

- 无 React 依赖的纯函数小工具

## 同级目录

（无子目录）

## 同级文件

| 文件 | 说明 |
|------|------|
| `format-time.ts` | 对话列表相对时间（刚刚 / 分钟前 / 月日） |
| `open-workspace-file.ts` | 对话文件引用与审查文件名/⌘单击行：App 开文件树，FileTree 读盘跳行 |
| `thread-runtime.ts` | 会话线程模式（本地 / Worktree）本机记忆；交接后仍记住关联 worktree 与起点分支；后台 turn 按 conversationId 取模式 |
| `thread-runtime.test.ts` | 当前会话用内存态、后台会话读落盘 |
| `thread-goal.ts` | 会话 `/goal` 本机记忆（含 `startedAt`）；后台 turn 读落盘、仅 active 注入 |
| `thread-goal.test.ts` | 读写与注入开关 |
| `ARCH.md` | 本层架构说明 |
