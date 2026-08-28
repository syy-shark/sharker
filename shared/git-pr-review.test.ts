import { describe, expect, it } from 'vitest'
import { localCommentsForGithub, postPullRequestLineComments } from './git-pr-review'
import type { ReviewLineComment } from './review-comment'

const local: ReviewLineComment = {
  id: 'c1',
  path: 'src/a.ts',
  line: 4,
  side: 'new',
  content: '',
  text: '补测试'
}

describe('git pr review write-back', () => {
  it('skips github-imported comments', () => {
    expect(
      localCommentsForGithub([
        local,
        { ...local, id: 'gh-9', text: '来自 GitHub' }
      ])
    ).toEqual([{ path: 'src/a.ts', line: 4, side: 'RIGHT', body: '补测试' }])
  })

  it('posts each local comment via gh api', async () => {
    const calls: string[][] = []
    const result = await postPullRequestLineComments({
      cwd: '/repo',
      owner: 'acme',
      repo: 'app',
      number: 12,
      comments: localCommentsForGithub([local]),
      run: async (_cwd, command, args) => {
        expect(command).toBe('gh')
        calls.push(args)
        return '{"id":1}'
      }
    })
    expect(result).toEqual({ ok: true, posted: 1 })
    expect(calls[0]?.[1]).toBe('repos/acme/app/pulls/12/comments')
    expect(calls[0]).toContain('--raw-field')
  })
})
