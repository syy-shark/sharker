# tools/builtins/file — 文件扩展读写

## 职责

- 超出简单 read/write 的文件能力：patch、notebook、PDF、官方 view_image、图结构

## 同级目录

（无子目录）

## 同级文件

| 文件 | 说明 |
|------|------|
| `apply-patch.ts` | 多 hunk 统一 patch 编辑 |
| `notebook.ts` | `read_notebook` / `edit_notebook`（.ipynb） |
| `read-pdf.ts` | PDF 转文本（pdftotext） |
| `view-image.ts` | 官方 `view_image`：校验本地图并写短结果；像素由 query-loop 回灌（对标 Codex #36966） |
| `view-image.test.ts` | 短结果、空格路径、`original`、非图/缺失、沙箱拒绝、计划模式白名单 |
| `read-image.ts` | `view_image` 别名，共用 `executeViewImage` |
| `read-graph.ts` | mermaid / dot / 图结构 JSON |
| `ARCH.md` | 本层架构说明 |
