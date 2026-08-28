import { mkdir, mkdtemp, readFile, rm, stat, unlink, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { handoffCheckout } from './git-handoff'
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
  },
  readFile: (abs: string) => readFile(abs),
  writeFile: (abs: string, data: Buffer) => writeFile(abs, data),
  mkdirp: (abs: string) => mkdir(abs, { recursive: true }).then(() => undefined)
}

describe('git handoff', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
  })

  it('copies dirty worktree files onto a clean local checkout', async () => {
    const local = await mkdtemp(path.join(os.tmpdir(), 'sharker-ho-local-'))
    dirs.push(local)
    await runGit(local, ['init'])
    await runGit(local, ['config', 'user.email', 'ho@test'])
    await runGit(local, ['config', 'user.name', 'ho'])
    await writeFile(path.join(local, 'app.ts'), 'const a = 1\n', 'utf8')
    await runGit(local, ['add', 'app.ts'])
    await runGit(local, ['commit', '-m', 'init'])

    const worktree = path.join(os.tmpdir(), `sharker-ho-wt-${Date.now()}`)
    await runGit(local, ['worktree', 'add', '--detach', worktree, 'HEAD'])
    dirs.push(worktree)
    await writeFile(path.join(worktree, 'app.ts'), 'const a = 2\n', 'utf8')
    await writeFile(path.join(worktree, 'extra.ts'), 'export const x = 1\n', 'utf8')

    const result = await handoffCheckout({
      direction: 'to_local',
      localCwd: local,
      worktreePath: worktree,
      io
    })
    expect(result.ok).toBe(true)
    expect(await readFile(path.join(local, 'app.ts'), 'utf8')).toBe('const a = 2\n')
    expect(await readFile(path.join(local, 'extra.ts'), 'utf8')).toContain('export const x')
  })

  it('refuses to hand off onto a dirty destination', async () => {
    const local = await mkdtemp(path.join(os.tmpdir(), 'sharker-ho-dirty-'))
    dirs.push(local)
    await runGit(local, ['init'])
    await runGit(local, ['config', 'user.email', 'ho@test'])
    await runGit(local, ['config', 'user.name', 'ho'])
    await writeFile(path.join(local, 'app.ts'), 'const a = 1\n', 'utf8')
    await runGit(local, ['add', 'app.ts'])
    await runGit(local, ['commit', '-m', 'init'])
    const worktree = path.join(os.tmpdir(), `sharker-ho-wt2-${Date.now()}`)
    await runGit(local, ['worktree', 'add', '--detach', worktree, 'HEAD'])
    dirs.push(worktree)
    await writeFile(path.join(local, 'app.ts'), 'local dirty\n', 'utf8')
    await writeFile(path.join(worktree, 'app.ts'), 'wt dirty\n', 'utf8')

    const result = await handoffCheckout({
      direction: 'to_local',
      localCwd: local,
      worktreePath: worktree,
      io
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/未提交/)
  })
})
