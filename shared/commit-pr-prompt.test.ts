import { describe, expect, it } from 'vitest'
import {
  applyGitPromptTemplates,
  clampGitPrompt,
  GIT_PROMPT_MAX,
  gitPromptSystemSection
} from './git-prompt'

describe('git prompt templates', () => {
  it('clamps and ignores empty templates', () => {
    expect(clampGitPrompt('  hello  ')).toBe('hello')
    expect(clampGitPrompt('x'.repeat(GIT_PROMPT_MAX + 20)).length).toBe(GIT_PROMPT_MAX)
    expect(gitPromptSystemSection({})).toBe('')
    expect(gitPromptSystemSection({ gitCommitPrompt: '   ' })).toBe('')
  })

  it('builds a system section and appends it to git-commit only', () => {
    const settings = {
      gitCommitPrompt: 'use conventional commits',
      gitPrPrompt: 'include test plan'
    }
    const section = gitPromptSystemSection(settings)
    expect(section).toContain('Commit message prompt:')
    expect(section).toContain('use conventional commits')
    expect(section).toContain('Pull request prompt:')
    expect(section).toContain('include test plan')
    expect(applyGitPromptTemplates('git-commit', 'base', settings)).toContain('base')
    expect(applyGitPromptTemplates('git-commit', 'base', settings)).toContain(
      'use conventional commits'
    )
    expect(applyGitPromptTemplates('other', 'base', settings)).toBe('base')
  })

  it('adds branch prefix and force-with-lease policy', () => {
    const section = gitPromptSystemSection({
      gitBranchPrefix: 'codex',
      gitForceWithLease: true
    })
    expect(section).toContain('# Git policy')
    expect(section).toContain('codex/')
    expect(section).toContain('--force-with-lease')
    expect(section).toContain('never `--force`')
    expect(gitPromptSystemSection({ gitForceWithLease: false })).toBe('')
  })
})
