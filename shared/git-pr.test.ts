import { describe, expect, it } from 'vitest'
import { createPullRequest, GITHUB_CLI_INSTALL_HINT, normalizePrTitle, parsePrUrl } from './git-pr'

describe('git pr', () => {
  it('rejects empty or flag-like titles', () => {
    expect(normalizePrTitle('  ')).toBeNull()
    expect(normalizePrTitle('--title oops')).toBeNull()
    expect(normalizePrTitle('Review pane commit')).toBe('Review pane commit')
  })

  it('parses the first URL from gh output', () => {
    expect(parsePrUrl('Opening https://github.com/acme/app/pull/12\n')).toBe(
      'https://github.com/acme/app/pull/12'
    )
    expect(parsePrUrl('nothing')).toBeNull()
  })

  it('invokes gh pr create with sanitized args', async () => {
    const calls: Array<{ command: string; args: string[] }> = []
    const result = await createPullRequest({
      cwd: '/repo',
      title: 'Add review commit',
      body: 'Ship compare scopes',
      base: 'main',
      run: async (_cwd, command, args) => {
        calls.push({ command, args })
        return 'https://github.com/acme/app/pull/9'
      }
    })
    expect(result).toEqual({ ok: true, url: 'https://github.com/acme/app/pull/9' })
    expect(calls).toEqual([
      {
        command: 'gh',
        args: [
          'pr',
          'create',
          '--title',
          'Add review commit',
          '--body',
          'Ship compare scopes',
          '--base',
          'main'
        ]
      }
    ])
  })

  it('maps missing gh to a readable error', async () => {
    const result = await createPullRequest({
      cwd: '/repo',
      title: 'x',
      run: async () => {
        throw new Error('spawn gh ENOENT')
      }
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe(GITHUB_CLI_INSTALL_HINT)
    expect(GITHUB_CLI_INSTALL_HINT).toMatch(/gh auth login/)
  })
})
