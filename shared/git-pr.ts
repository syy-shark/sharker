/**
 * 审查面板创建 Pull Request：走 GitHub CLI，不自己拼 API。
 * @see shared/ARCH.md
 */

/** Official leftover (learn.chatgpt.com/docs/code-review). */
export const GITHUB_CLI_INSTALL_HINT =
  'Install the GitHub CLI (`gh`) and authenticate it with `gh auth login` so Codex can load pull request context, review comments, and changed files. If `gh` is missing or unauthenticated, pull request details may not appear in the sidebar or review pane.'

/** 规范化 PR 标题：去掉首尾空白，拒绝空或 `-` 开头 */
export function normalizePrTitle(title: string): string | null {
  const text = String(title || '').trim()
  if (!text || text.startsWith('-')) return null
  return text
}

/** 从 gh 输出里抽出第一条 URL */
export function parsePrUrl(output: string): string | null {
  const m = /https?:\/\/\S+/.exec(String(output || ''))
  return m?.[0]?.replace(/[.)]+$/, '') ?? null
}

/** 可注入的命令执行（主进程 spawn `gh`） */
export type CommandRunner = (cwd: string, command: string, args: string[]) => Promise<string>

/** 用 `gh pr create` 开 PR */
export async function createPullRequest(options: {
  cwd: string
  title: string
  body?: string
  base?: string
  run: CommandRunner
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const root = String(options.cwd || '')
  if (!root) return { ok: false, error: '缺少工作区' }
  const title = normalizePrTitle(options.title)
  if (!title) return { ok: false, error: '请填写 PR 标题' }
  const args = ['pr', 'create', '--title', title]
  const body = String(options.body || '').trim()
  args.push('--body', body || title)
  const base = String(options.base || '').trim()
  if (base && !base.startsWith('-')) args.push('--base', base)
  try {
    const out = await options.run(root, 'gh', args)
    const url = parsePrUrl(out)
    if (!url) return { ok: false, error: out.trim() || 'gh 没有返回 PR 地址' }
    return { ok: true, url }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/ENOENT|not found|spawn gh/i.test(msg)) {
      return { ok: false, error: GITHUB_CLI_INSTALL_HINT }
    }
    return { ok: false, error: msg }
  }
}
