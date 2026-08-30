import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  applyGitPromptTemplates,
  clampGitPrompt,
  GIT_PROMPT_MAX,
  GIT_SETTINGS_DESCRIPTION,
  GIT_SETTINGS_LABEL,
  gitPromptSystemSection
} from './git-prompt'

describe('git prompt templates', () => {
  it('uses official Git settings copy', () => {
    expect(GIT_SETTINGS_LABEL).toBe('Git')
    expect(GIT_SETTINGS_DESCRIPTION).toBe(
      'Use Git settings to standardize branch naming and choose whether Codex uses force pushes. You can also set prompts that Codex uses to generate commit messages and pull request descriptions.'
    )
    const permissionsSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/settings/PermissionsSettings.tsx'),
      'utf8'
    )
    expect(permissionsSrc).toContain('GIT_SETTINGS_LABEL')
    expect(permissionsSrc).toContain('GIT_SETTINGS_DESCRIPTION')
    expect(permissionsSrc).not.toContain('Always force push')
    expect(permissionsSrc).not.toContain('Git branch naming')
  })

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
