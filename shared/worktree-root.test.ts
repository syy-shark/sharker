import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from './types'
import { normalizeSettings } from './workspace'
import { clampWorktreeRoot } from './worktree-root'

describe('worktree root', () => {
  it('keeps absolute paths and drops unsafe values', () => {
    expect(clampWorktreeRoot('')).toBe('')
    expect(clampWorktreeRoot('  /data/worktrees/  ')).toBe('/data/worktrees')
    expect(clampWorktreeRoot('relative/path')).toBe('')
    expect(clampWorktreeRoot('-evil')).toBe('')
    expect(clampWorktreeRoot('/tmp/../etc')).toBe('')
    expect(clampWorktreeRoot('C:/wt')).toBe('C:/wt')
    expect(clampWorktreeRoot('/')).toBe('')
    expect(clampWorktreeRoot('\\\\server\\share\\')).toBe('\\\\server\\share')
    expect(clampWorktreeRoot('/tmp/ok\0no')).toBe('')
  })

  it('survives settings normalize', () => {
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, worktreeRoot: '  /data/wt/  ' }, '/home/u').worktreeRoot).toBe(
      '/data/wt'
    )
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, worktreeRoot: '../etc' }, '/home/u').worktreeRoot).toBe('')
  })
})
