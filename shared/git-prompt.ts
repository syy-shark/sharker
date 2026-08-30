/**
 * Settings → Git 的 commit / PR 文案模板、分支前缀与 force-with-lease（对标 Codex developer-settings Git）。
 * @see shared/ARCH.md
 */
import { formatBranchPrefix } from './git-branch-create'

/** Official Settings → Git heading (learn.chatgpt.com/docs/developer-settings). */
export const GIT_SETTINGS_LABEL = 'Git'
/** Official Git settings intro. Does not invent Always force push as a control title. */
export const GIT_SETTINGS_DESCRIPTION =
  'Use Git settings to standardize branch naming and choose whether Codex uses force pushes. You can also set prompts that Codex uses to generate commit messages and pull request descriptions.'

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
  settings?: {
    gitCommitPrompt?: string
    gitPrPrompt?: string
    gitBranchPrefix?: string
    gitForceWithLease?: boolean
  }
): string {
  if (skillName !== 'git-commit' || !settings) return body
  const extra = gitPromptSystemSection(settings)
  if (!extra) return body
  return `${body}\n\n${extra}`
}

/** 写入 system：文案模板、分支前缀或 force-with-lease 任一有值 */
export function gitPromptSystemSection(settings?: {
  gitCommitPrompt?: string
  gitPrPrompt?: string
  gitBranchPrefix?: string
  gitForceWithLease?: boolean
}): string {
  const commit = clampGitPrompt(settings?.gitCommitPrompt)
  const pr = clampGitPrompt(settings?.gitPrPrompt)
  const prefix = formatBranchPrefix(settings?.gitBranchPrefix)
  const force = settings?.gitForceWithLease === true
  if (!commit && !pr && !prefix && !force) return ''
  const lines: string[] = []
  if (commit || pr) {
    lines.push(
      '# Git message style',
      'Use these user templates when drafting commit messages or pull request descriptions.'
    )
    if (commit) lines.push('', 'Commit message prompt:', commit)
    if (pr) lines.push('', 'Pull request prompt:', pr)
  }
  if (prefix || force) {
    if (lines.length) lines.push('')
    lines.push('# Git policy')
    if (prefix) {
      lines.push(
        `When creating a new branch, prefix the name with \`${prefix}\` unless it already starts with that prefix.`
      )
    }
    if (force) {
      lines.push('When pushing, use `git push --force-with-lease` (never `--force`).')
    }
  }
  return lines.join('\n')
}
