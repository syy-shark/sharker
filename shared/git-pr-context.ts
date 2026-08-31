/**
 * 当前分支的 GitHub PR 上下文与行内审查评论（对标 Codex PR review pane）。
 * 走 `gh`，不自己拼 token。
 * @see shared/ARCH.md
 */
import type { CommandRunner } from './git-pr'
import { GITHUB_CLI_INSTALL_HINT, parsePrUrl } from './git-pr'

/** Official leftover (learn.chatgpt.com/docs/code-review). */
export const REVIEW_PR_FEEDBACK_INTRO =
  'When Codex has GitHub access for your repository and the current project is on the pull request branch, the ChatGPT desktop app can help you work through pull request feedback without leaving the app. The sidebar shows pull request context and feedback from reviewers, and the review pane shows comments alongside the diff so you can ask Codex to address issues in the same chat.'
/** Official leftover (learn.chatgpt.com/docs/projects). */
export const REVIEW_PRIMARY_REPO_HINT =
  'Pull request and worktree actions target the primary repository. When you start a chat in a worktree, the other folders remain attached.'
import type { ReviewLineComment } from './review-comment'

/** 当前分支对应的 PR */
export interface PullRequestContext {
  number: number
  title: string
  url: string
  comments: ReviewLineComment[]
}

/** 顶栏 / 侧栏用的短标签 */
export function prToolbarLabel(number: number): string {
  const n = Number(number)
  if (!Number.isFinite(n) || n < 1) return ''
  return `PR #${Math.floor(n)}`
}

/** 从 `gh pr view --json` 取出编号 / 标题 / 地址 */
export function parsePrViewJson(raw: string): { number: number; title: string; url: string } | null {
  try {
    const data = JSON.parse(String(raw || '')) as {
      number?: unknown
      title?: unknown
      url?: unknown
    }
    const number = Number(data.number)
    const title = String(data.title || '').trim()
    const url = String(data.url || '').trim()
    if (!Number.isFinite(number) || number < 1 || !url) return null
    return { number, title: title || `PR #${number}`, url }
  } catch {
    return null
  }
}

/** 从 PR URL 解析 owner / repo / number */
export function parsePrUrlParts(
  url: string
): { owner: string; repo: string; number: number } | null {
  const m = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i.exec(String(url || ''))
  if (!m) return null
  const number = Number(m[3])
  if (!m[1] || !m[2] || !Number.isFinite(number)) return null
  return { owner: m[1], repo: m[2], number }
}

/** 把 GitHub review comment JSON 收成行内评论 */
export function parseReviewCommentsJson(raw: string): ReviewLineComment[] {
  try {
    const data = JSON.parse(String(raw || '')) as unknown
    if (!Array.isArray(data)) return []
    const out: ReviewLineComment[] = []
    for (const row of data) {
      if (!row || typeof row !== 'object') continue
      const item = row as {
        id?: unknown
        path?: unknown
        line?: unknown
        original_line?: unknown
        side?: unknown
        body?: unknown
        user?: { login?: unknown }
      }
      const path = String(item.path || '').trim().replaceAll('\\', '/')
      const line = Number(item.line || item.original_line)
      const body = String(item.body || '').trim()
      if (!path || path.includes('..') || !Number.isFinite(line) || line < 1 || !body) continue
      const author = String(item.user?.login || '').trim()
      out.push({
        id: `gh-${item.id ?? out.length}`,
        path,
        line,
        side: item.side === 'LEFT' ? 'old' : 'new',
        content: '',
        text: author ? `@${author}: ${body}` : body
      })
    }
    return out
  } catch {
    return []
  }
}

/** 把 PR 行内评论收成派给 Agent 的修改指令 */
export function formatPrCommentsPrompt(pr: PullRequestContext): string {
  const body = pr.comments
    .map((c) => `### ${c.path}:${c.line}\n${c.text}`)
    .join('\n\n')
  return `请处理 GitHub PR #${pr.number}（${pr.title}）上的审查评论，保持范围最小，不要改评论未提到的地方。\n${pr.url}\n\n${body}`
}

/** 用 gh 读取当前分支 PR 与行内评论 */
export async function loadPullRequestContext(options: {
  cwd: string
  run: CommandRunner
}): Promise<{ ok: true; context: PullRequestContext } | { ok: false; error: string }> {
  const root = String(options.cwd || '')
  if (!root) return { ok: false, error: '缺少工作区' }
  let viewOut = ''
  try {
    viewOut = await options.run(root, 'gh', ['pr', 'view', '--json', 'number,title,url'])
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/ENOENT|not found|spawn gh/i.test(msg)) {
      return { ok: false, error: GITHUB_CLI_INSTALL_HINT }
    }
    return { ok: false, error: msg || '当前分支没有 PR' }
  }
  const view = parsePrViewJson(viewOut)
  const url = view?.url || parsePrUrl(viewOut)
  if (!view && !url) return { ok: false, error: '当前分支没有 PR' }
  const parts = parsePrUrlParts(view?.url || url || '')
  if (!view || !parts) return { ok: false, error: '无法解析 PR 地址' }
  try {
    const commentsOut = await options.run(root, 'gh', [
      'api',
      `repos/${parts.owner}/${parts.repo}/pulls/${parts.number}/comments`
    ])
    return {
      ok: true,
      context: {
        number: view.number,
        title: view.title,
        url: view.url,
        comments: parseReviewCommentsJson(commentsOut)
      }
    }
  } catch (e) {
    return {
      ok: true,
      context: {
        number: view.number,
        title: view.title,
        url: view.url,
        comments: []
      }
    }
  }
}
