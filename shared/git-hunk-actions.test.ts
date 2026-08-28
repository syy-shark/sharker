import { mkdtemp, readFile, rm, stat, unlink, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildHunkPatch, splitDiffHunks } from './diff-hunk'
import { applyGitHunkAction } from './git-hunk-actions'
import { computeLineDiff } from './line-diff'
import { runGit } from '../tools/shared/git-runner'

const io = {
  runGit,
  unlink,
  rmDir: (abs: string) => rm(abs, { recursive: true, force: true }),
  stat: async (abs: string) => {
    try {
      const s = await stat(abs)
      return { isFile: s.isFile(), isDirectory: s.isDirectory() }
    } catch {
      return null
    }
  }
}

describe('git hunk actions', () => {
  const dirs: string[] = []
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
  })

  it('stages only the first hunk of two distant edits', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'sharker-hunk-'))
    dirs.push(dir)
    await runGit(dir, ['init'])
    await runGit(dir, ['config', 'user.email', 'test@sharker.local'])
    await runGit(dir, ['config', 'user.name', 'Sharker Test'])
    const oldBody = Array.from({ length: 20 }, (_, i) => `L${i + 1}`).join('\n') + '\n'
    await writeFile(path.join(dir, 'wide.ts'), oldBody, 'utf8')
    await runGit(dir, ['add', 'wide.ts'])
    await runGit(dir, ['commit', '-m', 'init'])

    const newLines = Array.from({ length: 20 }, (_, i) => `L${i + 1}`)
    newLines[1] = 'L2-edit'
    newLines[17] = 'L18-edit'
    await writeFile(path.join(dir, 'wide.ts'), newLines.join('\n') + '\n', 'utf8')

    const hunks = splitDiffHunks(computeLineDiff(oldBody.split('\n').slice(0, -1), newLines, { context: 3 }))
    expect(hunks.length).toBeGreaterThanOrEqual(2)
    const patch = buildHunkPatch({ path: 'wide.ts', hunk: hunks[0] })
    const result = await applyGitHunkAction({
      cwd: dir,
      action: 'stage',
      path: 'wide.ts',
      patch,
      scope: 'unstaged',
      io
    })
    expect(result.ok).toBe(true)
    const staged = await runGit(dir, ['diff', '--cached', '-U0'])
    expect(staged).toContain('L2-edit')
    expect(staged).not.toContain('L18-edit')
    const worktree = await readFile(path.join(dir, 'wide.ts'), 'utf8')
    expect(worktree).toContain('L18-edit')
  })
})
