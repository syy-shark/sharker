/**
 * Jupyter .ipynb 读写辅助。
 * @see tools/builtins/file/notebook.ts
 */

export interface NotebookCell {
  cell_type: 'code' | 'markdown' | 'raw'
  source: string | string[]
  metadata?: Record<string, unknown>
}

export interface NotebookDoc {
  cells: NotebookCell[]
  metadata?: Record<string, unknown>
  nbformat?: number
  nbformat_minor?: number
}

/** 解析 ipynb JSON */
export function parseNotebook(raw: string): NotebookDoc {
  return JSON.parse(raw) as NotebookDoc
}

/** cell source 转字符串 */
export function cellSourceText(cell: NotebookCell): string {
  return Array.isArray(cell.source) ? cell.source.join('') : cell.source
}

/** 格式化 notebook 供模型阅读 */
export function formatNotebook(doc: NotebookDoc, opts?: { cellIndex?: number }): string {
  const cells = doc.cells ?? []
  const indices =
    opts?.cellIndex != null ? [opts.cellIndex] : cells.map((_, i) => i)
  return indices
    .filter((i) => i >= 0 && i < cells.length)
    .map((i) => {
      const c = cells[i]
      const src = cellSourceText(c)
      return `--- Cell ${i} (${c.cell_type}) ---\n${src}`
    })
    .join('\n\n')
}
