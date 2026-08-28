import { mkdtemp, readFile, rm, stat, unlink, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { applyGitReviewAction, resolveReviewRelPath } from './git-review-actions'
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

async function makeRepo(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sharker-review-'))
  await runGit(dir, ['init'])
  await runGit(dir, ['config', 'user.email', 'test@sharker.local'])
  await runGit(dir, ['config', 'user.name', 'Sharker Test'])
  await writeFile(path.join(dir, 'keep.ts'), 'const a = 1\n', 'utf8')
  await runGit(dir, ['add', 'keep.ts'])
  await runGit(dir, ['commit', '-m', 'init'])
  return dir
}

describe('git review actions', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
  })

  it('rejects paths outside the workspace', () => {
    expect(resolveReviewRelPath('/tmp/repo', '../etc/passwd')).toBeNull()
    expect(resolveReviewRelPath('/tmp/repo', '.git/config')).toBeNull()
    expect(resolveReviewRelPath('/tmp/repo', 'src/app.ts')).toBe('src/app.ts')
  })

  it('stages, unstages and reverts a tracked edit', async () => {
    const dir = await makeRepo()
    dirs.push(dir)
    await writeFile(path.join(dir, 'keep.ts'), 'const a = 2\n', 'utf8')

    expect((await applyGitReviewAction({ cwd: dir, action: 'stage', paths: ['keep.ts'], io })).ok).toBe(
      true
    )
    expect(await runGit(dir, ['diff', '--cached', '--name-only'])).toContain('keep.ts')

    expect(
      (await applyGitReviewAction({ cwd: dir, action: 'unstage', paths: ['keep.ts'], io })).ok
    ).toBe(true)
    expect(await runGit(dir, ['diff', '--cached', '--name-only'])).toBe('')
    expect(await runGit(dir, ['diff', '--name-only'])).toContain('keep.ts')

    expect(
      (await applyGitReviewAction({ cwd: dir, action: 'revert', paths: ['keep.ts'], io })).ok
    ).toBe(true)
    expect(await readFile(path.join(dir, 'keep.ts'), 'utf8')).toBe('const a = 1\n')
  })

  it('reverts an untracked file by deleting it inside the repo', async () => {
    const dir = await makeRepo()
    dirs.push(dir)
    const extra = path.join(dir, 'scratch.ts')
    await writeFile(extra, 'tmp\n', 'utf8')

    expect((await applyGitReviewAction({ cwd: dir, action: 'revert', paths: ['scratch.ts'], io })).ok).toBe(
      true
    )
    await expect(stat(extra)).rejects.toThrow()
  })

  it('stages all unstaged files when paths are omitted', async () => {
    const dir = await makeRepo()
    dirs.push(dir)
    await writeFile(path.join(dir, 'keep.ts'), 'const a = 3\n', 'utf8')
    await writeFile(path.join(dir, 'extra.ts'), 'x\n', 'utf8')

    expect((await applyGitReviewAction({ cwd: dir, action: 'stage', io })).ok).toBe(true)
    const staged = await runGit(dir, ['diff', '--cached', '--name-only'])
    expect(staged).toContain('keep.ts')
    expect(staged).toContain('extra.ts')
  })
})
