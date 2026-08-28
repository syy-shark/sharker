import { mkdtemp, rm, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { afterEach, describe, expect, it } from 'vitest'
import { prepareThreadWorktree } from './thread-worktree'

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

    const first = await prepareThreadWorktree({
      workspacePath: repo,
      conversationId: 'conv-abc-123'
    })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    temps.push(first.path)
    expect(first.path).toContain('worktrees')

    const second = await prepareThreadWorktree({
      workspacePath: repo,
      conversationId: 'conv-abc-123'
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

    const result = await prepareThreadWorktree({
      workspacePath: repo,
      conversationId: 'conv-include-1'
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

    const result = await prepareThreadWorktree({
      workspacePath: repo,
      conversationId: 'conv-base-1',
      baseRef: 'feature-a'
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
})
