/**
 * Settings → Git 的 commit / PR 文案模板（对标 Codex developer-settings Git）。
 * @see shared/ARCH.md
 */

export const GIT_PROMPT_MAX = 4096

/** 去掉首尾空白并截断，避免把超长模板写进 system */
export function clampGitPrompt(raw: unknown): string {
  return String(raw ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, GIT_PROMPT_MAX)
}

/** 读 git-commit skill 时把用户模板接在正文后 */
export function applyGitPromptTemplates(
  skillName: string,
  body: string,
  settings?: { gitCommitPrompt?: string; gitPrPrompt?: string }
): string {
  if (skillName !== 'git-commit' || !settings) return body
  const extra = gitPromptSystemSection(settings)
  if (!extra) return body
  return `${body}\n\n${extra}`
}

/** 写入 system：仅当用户填了模板 */
export function gitPromptSystemSection(settings?: {
  gitCommitPrompt?: string
  gitPrPrompt?: string
}): string {
  const commit = clampGitPrompt(settings?.gitCommitPrompt)
  const pr = clampGitPrompt(settings?.gitPrPrompt)
  if (!commit && !pr) return ''
  const lines = [
    '# Git message style',
    'Use these user templates when drafting commit messages or pull request descriptions.'
  ]
  if (commit) lines.push('', 'Commit message prompt:', commit)
  if (pr) lines.push('', 'Pull request prompt:', pr)
  return lines.join('\n')
}
