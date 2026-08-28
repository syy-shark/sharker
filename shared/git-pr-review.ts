/**
 * 把本地行内评论发回 GitHub PR（对标 Codex 在同一线程处理完后回写）。
 * @see shared/ARCH.md
 */
import type { CommandRunner } from './git-pr'
import type { ReviewLineComment } from './review-comment'

export interface GithubReviewCommentDraft {
  path: string
  line: number
  side: 'LEFT' | 'RIGHT'
  body: string
}

/** 只发人手/Agent 本地评论，不重复发已从 GitHub 拉下来的 */
export function localCommentsForGithub(comments: ReviewLineComment[]): GithubReviewCommentDraft[] {
  const out: GithubReviewCommentDraft[] = []
  const seen = new Set<string>()
  for (const c of comments) {
    if (String(c.id || '').startsWith('gh-')) continue
    const path = String(c.path || '').trim().replaceAll('\\', '/')
    const body = String(c.text || '').trim()
    const line = Number(c.line)
    if (!path || path.includes('..') || !body || !Number.isFinite(line) || line < 1) continue
    const side: 'LEFT' | 'RIGHT' = c.side === 'old' ? 'LEFT' : 'RIGHT'
    const key = `${path}:${line}:${side}:${body}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ path, line, side, body })
  }
  return out
}

/** 用 gh api 逐条发 PR 行内评论 */
export async function postPullRequestLineComments(options: {
  cwd: string
  owner: string
  repo: string
  number: number
  comments: GithubReviewCommentDraft[]
  run: CommandRunner
}): Promise<{ ok: true; posted: number } | { ok: false; error: string; posted: number }> {
  const root = String(options.cwd || '')
  const owner = String(options.owner || '').trim()
  const repo = String(options.repo || '').trim()
  const number = Number(options.number)
  if (!root) return { ok: false, error: '缺少工作区', posted: 0 }
  if (!owner || !repo || !Number.isFinite(number) || number < 1) {
    return { ok: false, error: '无法解析 PR', posted: 0 }
  }
  const drafts = options.comments.filter((c) => c.path && c.body && c.line > 0)
  if (!drafts.length) return { ok: false, error: '没有可发布的本地评论', posted: 0 }
  let posted = 0
  for (const c of drafts) {
    try {
      await options.run(root, 'gh', [
        'api',
        `repos/${owner}/${repo}/pulls/${number}/comments`,
        '--method',
        'POST',
        '-f',
        `path=${c.path}`,
        '-F',
        `line=${String(c.line)}`,
        '-f',
        `side=${c.side}`,
        '--raw-field',
        `body=${c.body}`
      ])
      posted += 1
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/ENOENT|not found|spawn gh/i.test(msg)) {
        return { ok: false, error: '未安装 GitHub CLI（gh）', posted }
      }
      return { ok: false, error: msg || '发布评论失败', posted }
    }
  }
  return { ok: true, posted }
}
