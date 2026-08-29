# src/types — 前端专用类型

## 职责

- 仅渲染进程使用的类型（导航、排队 prompt 等）
- 跨进程契约仍放在 `shared/types.ts`

## 同级目录

（无子目录）

## 同级文件

| 文件 | 说明 |
|------|------|
| `navigation.ts` | `AppPage`（含 `skills`）、`SettingsTab`（含 `personalization`、`shortcuts`、`usage`） |
| `chat.ts` | `PromptSubmitMode`、`QueuedPrompt` 等 |
| `ARCH.md` | 本层架构说明 |
