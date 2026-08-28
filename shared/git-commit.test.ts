import { mkdtemp, rm, stat, unlink, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { commitStagedChanges, normalizeCommitMessage, pushCurrentBranch } from './git-commit'
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

describe('git commit', () => {
  const dirs: string[] = []
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
  })

  it('rejects empty or flag-like messages', () => {
    expect(normalizeCommitMessage('  ')).toBeNull()
    expect(normalizeCommitMessage('-m oops')).toBeNull()
    expect(normalizeCommitMessage('fix review pane')).toBe('fix review pane')
  })

  it('commits only staged files', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'sharker-commit-'))
    dirs.push(dir)
    await runGit(dir, ['init'])
    await runGit(dir, ['config', 'user.email', 'test@sharker.local'])
    await runGit(dir, ['config', 'user.name', 'Sharker Test'])
    await writeFile(path.join(dir, 'a.ts'), 'a\n', 'utf8')
    await runGit(dir, ['add', 'a.ts'])
    await runGit(dir, ['commit', '-m', 'init'])
    await writeFile(path.join(dir, 'a.ts'), 'a2\n', 'utf8')
    await runGit(dir, ['add', 'a.ts'])
    const result = await commitStagedChanges({ cwd: dir, message: 'update a', io })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.sha.length).toBeGreaterThan(3)
    const log = await runGit(dir, ['log', '-1', '--pretty=%s'])
    expect(log).toBe('update a')
  })

  it('refuses commit when nothing is staged', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'sharker-commit-empty-'))
    dirs.push(dir)
    await runGit(dir, ['init'])
    await runGit(dir, ['config', 'user.email', 'test@sharker.local'])
    await runGit(dir, ['config', 'user.name', 'Sharker Test'])
    await writeFile(path.join(dir, 'a.ts'), 'a\n', 'utf8')
    await runGit(dir, ['add', 'a.ts'])
    await runGit(dir, ['commit', '-m', 'init'])
    const result = await commitStagedChanges({ cwd: dir, message: 'nope', io })
    expect(result.ok).toBe(false)
  })

  it('reports push failure without a remote', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'sharker-push-'))
    dirs.push(dir)
    await runGit(dir, ['init'])
    await runGit(dir, ['config', 'user.email', 'test@sharker.local'])
    await runGit(dir, ['config', 'user.name', 'Sharker Test'])
    await writeFile(path.join(dir, 'a.ts'), 'a\n', 'utf8')
    await runGit(dir, ['add', 'a.ts'])
    await runGit(dir, ['commit', '-m', 'init'])
    const result = await pushCurrentBranch({ cwd: dir, io })
    expect(result.ok).toBe(false)
  })
})
