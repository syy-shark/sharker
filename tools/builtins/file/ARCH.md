# tools/builtins/file — 文件扩展读写

## 职责

- 超出简单 read/write 的文件能力：patch、notebook、PDF、图片元数据、图结构

## 同级目录

（无子目录）

## 同级文件

| 文件 | 说明 |
|------|------|
| `apply-patch.ts` | 多 hunk 统一 patch 编辑 |
| `notebook.ts` | `read_notebook` / `edit_notebook`（.ipynb） |
| `read-pdf.ts` | PDF 转文本（pdftotext） |
| `read-image.ts` | 图片元数据与路径（多模态/预览） |
| `read-graph.ts` | mermaid / dot / 图结构 JSON |
| `ARCH.md` | 本层架构说明 |
