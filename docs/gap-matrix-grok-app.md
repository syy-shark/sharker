# Gap matrix: RongleCat/grok-app workbench → Sharker

对照 [grok-app README Features](https://github.com/RongleCat/grok-app) 的工作台能力，与 Sharker（Electron 进程内 harness）的现状。  
**范围**：产品/UX 表面（tranche-1），不搬 Tauri/ACP/`grok` CLI 运行时。

状态：`have` = 已具备等价能力 · `partial` = 有可工作替代但未 1:1 · `missing` = 本 tranche 未交付。

| Capability (grok-app defining) | Status | Sharker note |
|--------------------------------|--------|--------------|
| Projects + sessions (trusted dirs, sidebar list, archive) | have | 工作区 `workspaces` + 对话列表；侧栏新建/切换/归档（设置 → 已归档） |
| Permission Ask default; Allow once / Allow for session / Deny | have | 默认需确认（Ask）；`InlineApproval` + `SessionApprovalStore` 强制 once/session/deny；全局 always-allow 非默认（`permissionMode` 沙箱/完整是路径策略，不是 YOLO 默认） |
| Multi-session stream continuity (switch without clobber) | have | 流式 chunk 带 `conversationId`；渲染层按会话缓冲；切换不 abort 进行中 turn；返回仍见该会话 in-flight/完成态 |
| Composer follow-up queue while busy | have | 忙时排队；队列按 `conversationId` 归属，A 的 follow-up 不会在 B 上派发 |
| Composer slash + attachments | have | 输入 `/` 弹出斜杠目录（↑↓/Enter/Esc）；`@` 文件、`$` Skill；图片附件路径稳定 |
| Resources / files pane | have | 右侧面板「文件」树 + 终端 + 浏览器 |
| Changes / session diffs + workspace git | have | 右侧「变更」审查：未提交/本轮/分支、文件/hunk 暂存还原、提交/推送/创建 PR、行内评论回对话；工具写盘后即时刷新；会话内工具 diff 仍在消息流 |
| Automations (scheduled list / NL create) | partial | `AutomationsPage` + 侧栏审查队列（接受/修订/拒绝，只动该任务改过的文件）；到期新建线程、不抢当前对话；无 grok-app 级 NL 静默建任务 |
| Settings: providers | have | 设置 → 模型：多 provider、Key/订阅导入、测通 |
| Settings: theme (light/dark) | have | 浅色水滴玻璃 / 深色金属（`uiTheme`） |
| Plan / Goal sticky progress | partial | `PlanBuildBar` + plan/build harness；无独立 Goal 产品入口 |
| YOLO / per-project permission tier | partial | 设置级 `permissionMode` sandbox/full；无 per-project 分级条与 YOLO 一键 |
| Account / SuperGrok quota heatmap | partial | SuperGrok OAuth + token 用量热力数据存在；非 grok-app 多账号切换 UI |
| Packaging multi-OS / tray / auto-update | missing | 明确非目标（macOS-first Electron） |

## Defining workbench rows (acceptance)

验收要求覆盖的定义行（上表对应）：

1. projects+sessions → **have**
2. permission Ask/once/session/deny → **have**
3. multi-session stream continuity → **have**
4. composer queue+slash+attachments → **have**
5. resources/Changes → **have**
6. automations → **partial**
7. settings providers/theme → **have**

## Non-goals (explicit)

- Tauri 2 / 真实 `grok` CLI ACP 包装  
- 全量 P0 矩阵 (~80 项)、远程 ACP、i18n 全覆盖、诊断 zip 等  

更新代码时请同步本表状态，便于审计 claims vs 实现。
