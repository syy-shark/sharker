import { mkdtemp, rm } from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { runGit } from '../tools/shared/git-runner'
import { initGitRepository } from './git-init'

describe('git init for review', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it('creates a main-branch repo and refuses a second init', async () => {
    expect((await initGitRepository({ cwd: '', runGit })).ok).toBe(false)
    expect((await initGitRepository({ cwd: '/', runGit })).ok).toBe(false)
    const dir = await mkdtemp(path.join(os.tmpdir(), 'sharker-git-init-'))
    dirs.push(dir)
    const created = await initGitRepository({ cwd: dir, runGit })
    expect(created).toEqual({ ok: true, branch: 'main' })
    const head = (await runGit(dir, ['symbolic-ref', '--short', 'HEAD'])).trim()
    expect(head).toBe('main')
    const again = await initGitRepository({ cwd: dir, runGit })
    expect(again.ok).toBe(false)
  })
})
