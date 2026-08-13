# tools/builtins/computer-use — 桌面自动化

## 职责

- macOS Computer Use：截图、列窗口、点击/键入/滚动等
- 依赖 screencapture、osascript、可选 cliclick / cua-driver

## 同级目录

（无子目录）

## 同级文件

| 文件 | 说明 |
|------|------|
| `index.ts` | `desktop_*` 工具 handler |
| `shared.ts` | 依赖检测、外部命令执行、doctor 报告 |
| `ARCH.md` | 本层架构说明 |

## 相关

- [docs/computer-use-setup.md](../../../docs/computer-use-setup.md)
- 状态聚合：`shared/computer-use-status.ts`
