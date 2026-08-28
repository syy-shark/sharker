import { describe, expect, it } from 'vitest'
import { buildHunkPatch, splitDiffHunks } from './diff-hunk'
import { computeLineDiff } from './line-diff'

describe('diff hunks', () => {
  it('splits distant edits into two hunks', () => {
    const oldLines = Array.from({ length: 20 }, (_, i) => `L${i + 1}`)
    const newLines = [...oldLines]
    newLines[1] = 'L2-edit'
    newLines[17] = 'L18-edit'
    const lines = computeLineDiff(oldLines, newLines, { context: 3 })
    const hunks = splitDiffHunks(lines)
    expect(hunks.length).toBe(2)
    expect(hunks[0].lines.some((l) => l.content === 'L2-edit')).toBe(true)
    expect(hunks[1].lines.some((l) => l.content === 'L18-edit')).toBe(true)
  })

  it('builds a unified patch for one hunk', () => {
    const hunks = splitDiffHunks([
      { kind: 'ctx', oldLine: 1, newLine: 1, content: 'keep' },
      { kind: 'del', oldLine: 2, content: 'old' },
      { kind: 'add', newLine: 2, content: 'new' }
    ])
    expect(hunks).toHaveLength(1)
    const patch = buildHunkPatch({ path: 'src/a.ts', hunk: hunks[0] })
    expect(patch).toContain('--- a/src/a.ts')
    expect(patch).toContain('+++ b/src/a.ts')
    expect(patch).toContain('-old')
    expect(patch).toContain('+new')
    expect(patch).toMatch(/@@ -1,2 \+1,2 @@/)
  })
})
