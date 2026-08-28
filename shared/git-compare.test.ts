import { mkdtemp, rm, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { runGit } from '../tools/shared/git-runner'
import {
  fileInLastTurn,
  listBranchChanges,
  listCommitChanges,
  parseCommitLog,
  parseNameStatus
} from './git-compare'

describe('git compare', () => {
  it('parses commit log lines', () => {
    expect(parseCommitLog('abc1234\tfix login\n')).toEqual([{ sha: 'abc1234', subject: 'fix login' }])
  })

  it('parses name-status including renames', () => {
    const files = parseNameStatus('M\tsrc/a.ts\nA\tnew.ts\nR100\told.ts -> new-name.ts\n')
    expect(files.map((f) => f.path)).toEqual(['src/a.ts', 'new.ts', 'new-name.ts'])
    expect(files[0]?.status).toBe('M')
  })

  it('matches last-turn paths by relative path or basename', () => {
    expect(fileInLastTurn('src/App.tsx', ['src/App.tsx'])).toBe(true)
    expect(fileInLastTurn('src/App.tsx', ['/abs/proj/src/App.tsx'])).toBe(true)
    expect(fileInLastTurn('src/App.tsx', ['App.tsx'])).toBe(true)
    expect(fileInLastTurn('src/App.tsx', ['other.ts'])).toBe(false)
  })

  it('lists committed files on a feature branch against main', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'sharker-compare-'))
    try {
      await runGit(dir, ['init', '-b', 'main'])
      await runGit(dir, ['config', 'user.email', 'test@sharker.local'])
      await runGit(dir, ['config', 'user.name', 'Sharker Test'])
      await writeFile(path.join(dir, 'a.ts'), 'a\n', 'utf8')
      await runGit(dir, ['add', 'a.ts'])
      await runGit(dir, ['commit', '-m', 'init'])
      await runGit(dir, ['checkout', '-b', 'feat'])
      await writeFile(path.join(dir, 'b.ts'), 'b\n', 'utf8')
      await runGit(dir, ['add', 'b.ts'])
      await runGit(dir, ['commit', '-m', 'feat'])
      const result = await listBranchChanges({ cwd: dir, runGit })
      expect(result.base).toBe('main')
      expect(result.files.map((f) => f.path)).toEqual(['b.ts'])
      const feat = await runGit(dir, ['rev-parse', 'HEAD'])
      const commit = await listCommitChanges({ cwd: dir, sha: feat.trim(), runGit })
      expect(commit.files.map((f) => f.path)).toEqual(['b.ts'])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
