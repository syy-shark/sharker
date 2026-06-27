/**
 * apply_patch：多 hunk 统一 patch 编辑。
 * @see tools/README.md
 */
import fs from 'fs/promises'
import path from 'path'
import { applyHunkToContent, parsePatch } from '../../../shared/patch'
import { buildFileDiff, formatEditSummary } from '../../../shared/line-diff'
import { assertAccess, ok } from '../../context'
import { normalizePath } from '../../permissions'
import { readTextFileOrNull } from '../../shared/fs-text'
import type { ToolHandler } from '../../types'

export const applyPatchTool: ToolHandler = {
  name: 'apply_patch',
  title: '应用补丁',
  extractPaths: (args) => {
    const patch = String(args.patch ?? '')
    return parsePatch(patch).map((h) => h.path)
  },
  async execute(args, ctx) {
    const patch = String(args.patch)
    const hunks = parsePatch(patch)
    if (!hunks.length) throw new Error('No valid patch hunks found')
    const summaries: string[] = []
    let lastDiff: ReturnType<typeof buildFileDiff> | undefined
    for (const hunk of hunks) {
      const p = normalizePath(hunk.path)
      assertAccess(ctx, p)
      const oldText = await readTextFileOrNull(p)
      const { next, created } = applyHunkToContent(oldText, hunk)
      await fs.mkdir(path.dirname(p), { recursive: true })
      await fs.writeFile(p, next, 'utf8')
      const fileDiff = buildFileDiff(p, oldText, next)
      lastDiff = fileDiff
      summaries.push(
        created ? `Created ${p}` : formatEditSummary(p, fileDiff.stats)
      )
    }
    return ok(summaries.join('\n'), lastDiff)
  }
}
