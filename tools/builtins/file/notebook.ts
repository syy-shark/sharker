/**
 * read_notebook / edit_notebook：Jupyter .ipynb 读写。
 * @see tools/README.md
 */
import fs from 'fs/promises'
import {
  cellSourceText,
  formatNotebook,
  parseNotebook,
  type NotebookCell
} from '../../../shared/notebook'
import { assertAccess, ok } from '../../context'
import { normalizePath } from '../../permissions'
import type { ToolHandler } from '../../types'

export const readNotebookTool: ToolHandler = {
  name: 'read_notebook',
  title: '读取笔记本',
  extractPaths: (args) => [String(args.path)],
  async execute(args, ctx) {
    const p = normalizePath(String(args.path))
    assertAccess(ctx, p)
    const raw = await fs.readFile(p, 'utf8')
    const doc = parseNotebook(raw)
    const cellIndex = args.cell_index != null ? Number(args.cell_index) : undefined
    return ok(formatNotebook(doc, { cellIndex }))
  }
}

export const editNotebookTool: ToolHandler = {
  name: 'edit_notebook',
  title: '编辑笔记本',
  extractPaths: (args) => [String(args.path)],
  async execute(args, ctx) {
    const p = normalizePath(String(args.path))
    assertAccess(ctx, p)
    const raw = await fs.readFile(p, 'utf8')
    const doc = parseNotebook(raw)
    const cellIndex = Number(args.cell_index)
    const action = String(args.action ?? 'replace') as 'replace' | 'insert' | 'delete'
    const newSource = args.new_source != null ? String(args.new_source) : ''
    if (cellIndex < 0 || cellIndex > doc.cells.length) {
      throw new Error('cell_index out of range')
    }
    if (action === 'delete') {
      doc.cells.splice(cellIndex, 1)
    } else if (action === 'insert') {
      const cell: NotebookCell = {
        cell_type: (args.cell_type as NotebookCell['cell_type']) ?? 'code',
        source: newSource
      }
      doc.cells.splice(cellIndex, 0, cell)
    } else {
      doc.cells[cellIndex].source = newSource
    }
    await fs.writeFile(p, JSON.stringify(doc, null, 2), 'utf8')
    return ok(`${action} cell ${cellIndex} in ${p}`)
  }
}
