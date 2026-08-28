import { mkdtemp, rm, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createPermanentWorktree,
  prepareThreadWorktree,
  removeManagedWorktree
} from './thread-worktree'
import { readFile as readUtf, utimes } from 'fs/promises'

const execFileAsync = promisify(execFile)

describe('prepareThreadWorktree', () => {
  const temps: string[] = []

  afterEach(async () => {
    await Promise.all(
      temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
    )
  })

  it('creates a detached worktree and reuses it', async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), 'sharker-wt-'))
    temps.push(repo)
    await execFileAsync('git', ['init'], { cwd: repo })
    await execFileAsync('git', ['config', 'user.email', 'wt@test'], { cwd: repo })
    await execFileAsync('git', ['config', 'user.name', 'wt'], { cwd: repo })
    await writeFile(path.join(repo, 'README.md'), 'hello\n')
    await execFileAsync('git', ['add', 'README.md'], { cwd: repo })
    await execFileAsync('git', ['commit', '-m', 'init'], { cwd: repo })

    const home = await mkdtemp(path.join(os.tmpdir(), 'sharker-home-'))
    temps.push(home)
    const first = await prepareThreadWorktree({
      workspacePath: repo,
      conversationId: 'conv-abc-123',
      home
    })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    temps.push(first.path)
    expect(first.path).toContain('worktrees')

    const second = await prepareThreadWorktree({
      workspacePath: repo,
      conversationId: 'conv-abc-123',
      home
    })
    expect(second.ok).toBe(true)
    if (second.ok) expect(second.path).toBe(first.path)
  })

  it('copies ignored .worktreeinclude files into a new worktree', async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), 'sharker-wt-inc-'))
    temps.push(repo)
    await execFileAsync('git', ['init'], { cwd: repo })
    await execFileAsync('git', ['config', 'user.email', 'wt@test'], { cwd: repo })
    await execFileAsync('git', ['config', 'user.name', 'wt'], { cwd: repo })
    await writeFile(path.join(repo, 'README.md'), 'hello\n')
    await writeFile(path.join(repo, '.gitignore'), '.env\n')
    await writeFile(path.join(repo, '.env'), 'SECRET=1\n')
    await writeFile(path.join(repo, '.worktreeinclude'), '.env\n')
    await execFileAsync('git', ['add', 'README.md', '.gitignore', '.worktreeinclude'], { cwd: repo })
    await execFileAsync('git', ['commit', '-m', 'init'], { cwd: repo })

    const home = await mkdtemp(path.join(os.tmpdir(), 'sharker-home-inc-'))
    temps.push(home)
    const result = await prepareThreadWorktree({
      workspacePath: repo,
      conversationId: 'conv-include-1',
      home
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    temps.push(result.path)
    const copied = await (await import('fs/promises')).readFile(path.join(result.path, '.env'), 'utf8')
    expect(copied).toBe('SECRET=1\n')
  })

  it('creates the worktree from a named base ref', async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), 'sharker-wt-base-'))
    temps.push(repo)
    await execFileAsync('git', ['init'], { cwd: repo })
    await execFileAsync('git', ['config', 'user.email', 'wt@test'], { cwd: repo })
    await execFileAsync('git', ['config', 'user.name', 'wt'], { cwd: repo })
    await writeFile(path.join(repo, 'README.md'), 'main\n')
    await execFileAsync('git', ['add', 'README.md'], { cwd: repo })
    await execFileAsync('git', ['commit', '-m', 'init'], { cwd: repo })
    await execFileAsync('git', ['checkout', '-b', 'feature-a'], { cwd: repo })
    await writeFile(path.join(repo, 'README.md'), 'feature\n')
    await execFileAsync('git', ['add', 'README.md'], { cwd: repo })
    await execFileAsync('git', ['commit', '-m', 'feat'], { cwd: repo })
    await execFileAsync('git', ['checkout', '-'], { cwd: repo })

    const home = await mkdtemp(path.join(os.tmpdir(), 'sharker-home-base-'))
    temps.push(home)
    const result = await prepareThreadWorktree({
      workspacePath: repo,
      conversationId: 'conv-base-1',
      baseRef: 'feature-a',
      home
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    temps.push(result.path)
    const { stdout } = await execFileAsync('git', ['show', 'HEAD:README.md'], { cwd: result.path })
    expect(stdout).toBe('feature\n')
  })

  it('rejects a non-git folder', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'sharker-nongit-'))
    temps.push(dir)
    const result = await prepareThreadWorktree({
      workspacePath: dir,
      conversationId: 'conv-1'
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/git/)
  })

  it('prunes older managed worktrees and restores a snapshot', async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), 'sharker-wt-prune-'))
    const home = await mkdtemp(path.join(os.tmpdir(), 'sharker-home-prune-'))
    temps.push(repo, home)
    await execFileAsync('git', ['init'], { cwd: repo })
    await execFileAsync('git', ['config', 'user.email', 'wt@test'], { cwd: repo })
    await execFileAsync('git', ['config', 'user.name', 'wt'], { cwd: repo })
    await writeFile(path.join(repo, 'README.md'), 'hello\n')
    await execFileAsync('git', ['add', 'README.md'], { cwd: repo })
    await execFileAsync('git', ['commit', '-m', 'init'], { cwd: repo })

    const first = await prepareThreadWorktree({
      workspacePath: repo,
      conversationId: 'conv-old-1',
      home,
      keep: 2
    })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    await writeFile(path.join(first.path, 'scratch.txt'), 'keep-me\n')
    await utimes(first.path, new Date(1_700_000_000_000), new Date(1_700_000_000_000))

    const second = await prepareThreadWorktree({
      workspacePath: repo,
      conversationId: 'conv-mid-2',
      home,
      keep: 2
    })
    expect(second.ok).toBe(true)
    if (second.ok) {
      await utimes(second.path, new Date(1_700_000_100_000), new Date(1_700_000_100_000))
    }

    const third = await prepareThreadWorktree({
      workspacePath: repo,
      conversationId: 'conv-new-3',
      home,
      keep: 2
    })
    expect(third.ok).toBe(true)
    if (!third.ok) return

    const { stdout } = await execFileAsync('git', ['worktree', 'list'], { cwd: repo })
    expect(stdout).not.toContain(first.path)
    expect(stdout).toContain(third.path)

    const restored = await prepareThreadWorktree({
      workspacePath: repo,
      conversationId: 'conv-old-1',
      home,
      keep: 3
    })
    expect(restored.ok).toBe(true)
    if (!restored.ok) return
    temps.push(restored.path)
    expect(await readUtf(path.join(restored.path, 'scratch.txt'), 'utf8')).toBe('keep-me\n')
  })

  it('creates a permanent worktree outside the managed prune root', async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), 'sharker-wt-perm-'))
    const home = await mkdtemp(path.join(os.tmpdir(), 'sharker-home-perm-'))
    temps.push(repo, home)
    await execFileAsync('git', ['init'], { cwd: repo })
    await execFileAsync('git', ['config', 'user.email', 'wt@test'], { cwd: repo })
    await execFileAsync('git', ['config', 'user.name', 'wt'], { cwd: repo })
    await writeFile(path.join(repo, 'README.md'), 'hello\n')
    await execFileAsync('git', ['add', 'README.md'], { cwd: repo })
    await execFileAsync('git', ['commit', '-m', 'init'], { cwd: repo })

    const result = await createPermanentWorktree({
      workspacePath: repo,
      name: 'Feature A',
      home
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    temps.push(result.path)
    expect(result.path).toContain(`${path.sep}permanent${path.sep}`)
    expect(result.branch).toBe('perm/Feature-A')
  })

  it('removes a managed worktree after archive', async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), 'sharker-wt-rm-'))
    const home = await mkdtemp(path.join(os.tmpdir(), 'sharker-home-rm-'))
    temps.push(repo, home)
    await execFileAsync('git', ['init'], { cwd: repo })
    await execFileAsync('git', ['config', 'user.email', 'wt@test'], { cwd: repo })
    await execFileAsync('git', ['config', 'user.name', 'wt'], { cwd: repo })
    await writeFile(path.join(repo, 'README.md'), 'hello\n')
    await execFileAsync('git', ['add', 'README.md'], { cwd: repo })
    await execFileAsync('git', ['commit', '-m', 'init'], { cwd: repo })

    const prepared = await prepareThreadWorktree({
      workspacePath: repo,
      conversationId: 'conv-archive-1',
      home,
      keep: 0
    })
    expect(prepared.ok).toBe(true)
    if (!prepared.ok) return
    const removed = await removeManagedWorktree({
      workspacePath: repo,
      conversationId: 'conv-archive-1',
      home
    })
    expect(removed).toEqual({ ok: true, removed: true })
    const { stdout } = await execFileAsync('git', ['worktree', 'list'], { cwd: repo })
    expect(stdout).not.toContain(prepared.path)
  })
})
