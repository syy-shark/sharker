import { describe, expect, it } from 'vitest'
import {
  formatPrCommentsPrompt,
  loadPullRequestContext,
  parsePrUrlParts,
  parsePrViewJson,
  parseReviewCommentsJson,
  prToolbarLabel
} from './git-pr-context'

describe('git pr context', () => {
  it('formats a toolbar chip label', () => {
    expect(prToolbarLabel(12)).toBe('PR #12')
    expect(prToolbarLabel(0)).toBe('')
  })

  it('parses pr view json and github review comments', () => {
    expect(parsePrViewJson('{"number":12,"title":"Fix scroll","url":"https://github.com/acme/app/pull/12"}')).toEqual(
      {
        number: 12,
        title: 'Fix scroll',
        url: 'https://github.com/acme/app/pull/12'
      }
    )
    expect(parsePrUrlParts('https://github.com/acme/app/pull/12')).toEqual({
      owner: 'acme',
      repo: 'app',
      number: 12
    })
    const comments = parseReviewCommentsJson(
      JSON.stringify([
        {
          id: 9,
          path: 'src/a.ts',
          line: 4,
          side: 'RIGHT',
          body: '缺少测试',
          user: { login: 'alice' }
        }
      ])
    )
    expect(comments[0]).toMatchObject({
      id: 'gh-9',
      path: 'src/a.ts',
      line: 4,
      side: 'new',
      text: '@alice: 缺少测试'
    })
  })

  it('loads context via gh pr view + api', async () => {
    const calls: string[][] = []
    const result = await loadPullRequestContext({
      cwd: '/repo',
      run: async (_cwd, command, args) => {
        expect(command).toBe('gh')
        calls.push(args)
        if (args[0] === 'pr') {
          return '{"number":3,"title":"Review","url":"https://github.com/acme/app/pull/3"}'
        }
        return '[{"id":1,"path":"x.ts","line":2,"side":"LEFT","body":"nits"}]'
      }
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.context.number).toBe(3)
      expect(result.context.comments[0]?.side).toBe('old')
      expect(formatPrCommentsPrompt(result.context)).toContain('PR #3')
      expect(formatPrCommentsPrompt(result.context)).toContain('x.ts:2')
    }
    expect(calls[1]?.[1]).toBe('repos/acme/app/pulls/3/comments')
  })

  it('maps missing gh to a readable error', async () => {
    const result = await loadPullRequestContext({
      cwd: '/repo',
      run: async () => {
        throw new Error('spawn gh ENOENT')
      }
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('GitHub CLI')
  })
})
