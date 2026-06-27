/**
 * read_pdf：PDF 转文本（pdftotext）。
 * @see tools/README.md
 */
import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import { assertAccess, ok } from '../../context'
import { normalizePath } from '../../permissions'
import type { ToolHandler } from '../../types'

const execFileAsync = promisify(execFile)

export const readPdfTool: ToolHandler = {
  name: 'read_pdf',
  title: '读取 PDF',
  extractPaths: (args) => [String(args.path)],
  async execute(args, ctx) {
    const p = normalizePath(String(args.path))
    assertAccess(ctx, p)
    await fs.access(p)
    try {
      const { stdout } = await execFileAsync('pdftotext', [p, '-'], {
        maxBuffer: 8 * 1024 * 1024,
        timeout: 120_000
      })
      const text = stdout.trim()
      const offset = Number(args.offset ?? 1) - 1
      const limit = args.limit ? Number(args.limit) : undefined
      const lines = text.split('\n')
      const slice = limit != null ? lines.slice(offset, offset + limit) : lines.slice(offset)
      return ok(slice.map((l, i) => `L${offset + i + 1}: ${l}`).join('\n') || '(empty pdf)')
    } catch {
      throw new Error('pdftotext failed — install poppler-utils: sudo apt install poppler-utils')
    }
  }
}
