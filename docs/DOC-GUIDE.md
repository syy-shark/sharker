# 文档驱动开发指南

## 代码注释约定

- 每个 `.ts` / `.tsx` 源文件顶部有 **文件级 JSDoc**（中文说明职责 + `@see` 对应 README）。
- **每个导出**的函数、类、常量、interface/type 上方有简短 **JSDoc**（中文：做什么、关键参数/返回值）。
- **非平凡内部函数**（非一行 getter）同样加 JSDoc；函数体内仅在逻辑非常晦涩时写行内注释。
- React 组件在导出函数上方写 JSDoc，或在文件头说明 Props 用途；不写 JSX `map` 回调里的箭头函数注释。
- `tool-definitions.ts`：文件头 + 每组工具一段区块注释即可。
- 改逻辑时 **同步更新** 相关注释。

## 原则

1. **每个模块一个 README**：`agent/`、`tools/`、`src/` 等目录下必须有 `README.md`。
2. **全局索引在 `docs/`**：新模块加入时，在 [docs/README.md](./README.md) 登记。
3. **改代码必改文档**：行为、接口、依赖变化时，同一 PR / 同一次提交更新对应 README。
4. **AI 先读后改**：修改某模块前，先读该模块 README + [ARCHITECTURE.md](./ARCHITECTURE.md)。

## 模块 README 应包含什么

- **职责**：这个模块管什么、不管什么
- **关键文件**：文件列表与一句话说明
- **对外接口**：导出函数、IPC、Props
- **依赖**：依赖哪些模块、被谁依赖
- **扩展点**：以后要加功能改哪里

## 全局文档何时更新

| 变更类型 | 更新文档 |
|----------|----------|
| 新工具 / 改 Harness 策略 | `agent-capabilities.md` + `agent/README.md` |
| 新 IPC / 存储格式 | `ARCHITECTURE.md` + `electron/README.md` |
| 新 UI 页面/流程 | `src/README.md` |
| 新里程碑 / 已拍板决策 | `roadmap-harness.md` |

## 给 AI 的提示

在 Sharker **用户工作区**里，项目规则写在 `<工作区>/.sharker/AGENTS.md`（路线图 Phase 2，待实现）。

在 **Sharker 源码仓库**里，以 `docs/` + 各模块 `README.md` 为准。
