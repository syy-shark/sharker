import { mkdtemp, rm, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { createNamedBranch, normalizeBranchName } from './git-branch-create'
import { runGit } from '../tools/shared/git-runner'
import { unlink, stat } from 'fs/promises'

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

describe('git branch create', () => {
  const dirs: string[] = []
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
  })

  it('rejects unsafe names', () => {
    expect(normalizeBranchName('')).toBeNull()
    expect(normalizeBranchName('-b oops')).toBeNull()
    expect(normalizeBranchName('has space')).toBeNull()
    expect(normalizeBranchName('feat/review-pane')).toBe('feat/review-pane')
  })

  it('creates a named branch from detached HEAD', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'sharker-branch-'))
    dirs.push(dir)
    await runGit(dir, ['init', '-b', 'main'])
    await runGit(dir, ['config', 'user.email', 'test@sharker.local'])
    await runGit(dir, ['config', 'user.name', 'Sharker Test'])
    await writeFile(path.join(dir, 'a.ts'), 'a\n', 'utf8')
    await runGit(dir, ['add', 'a.ts'])
    await runGit(dir, ['commit', '-m', 'init'])
    await runGit(dir, ['checkout', '--detach'])
    const result = await createNamedBranch({ cwd: dir, name: 'wt-review', io })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.branch).toBe('wt-review')
    expect((await runGit(dir, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()).toBe('wt-review')
  })
})
