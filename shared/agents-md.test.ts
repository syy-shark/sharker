import { describe, expect, it } from 'vitest'
import {
  AGENTS_MD_SCAFFOLD,
  clampPersonalAgentsMd,
  dirsFromRootToCwd,
  globalPersonalAgentsMdPath,
  mergeAgentsDocs,
  pickAgentsDoc
} from './agents-md'

describe('agents.md discovery', () => {
  it('walks from repo root to cwd', () => {
    expect(dirsFromRootToCwd('/repo', '/repo/src/lib')).toEqual([
      '/repo',
      '/repo/src',
      '/repo/src/lib'
    ])
    expect(dirsFromRootToCwd('/repo', '/other')).toEqual(['/repo'])
  })

  it('prefers override over AGENTS.md and .sharker fallback', () => {
    expect(
      pickAgentsDoc({
        'AGENTS.md': 'base',
        'AGENTS.override.md': 'override',
        '.sharker/AGENTS.md': 'legacy'
      })?.content
    ).toBe('override')
    expect(pickAgentsDoc({ '.sharker/AGENTS.md': 'legacy' })?.name).toBe('.sharker/AGENTS.md')
  })

  it('merges root-down and truncates at the cap', () => {
    const text = mergeAgentsDocs(
      [
        { source: 'global', content: 'AAA' },
        { source: 'root', content: 'BBB' }
      ],
      40
    )
    expect(text).toContain('AAA')
    expect(text.length).toBeLessThanOrEqual(40)
  })

  it('has a non-empty init scaffold', () => {
    expect(AGENTS_MD_SCAFFOLD).toContain('# 项目说明')
    expect(AGENTS_MD_SCAFFOLD).toContain('## Code Review Rules')
  })

  it('points personal instructions at ~/.sharker/AGENTS.md', () => {
    expect(globalPersonalAgentsMdPath('/Users/me')).toBe('/Users/me/.sharker/AGENTS.md')
    expect(clampPersonalAgentsMd('ok')).toBe('ok')
    expect(clampPersonalAgentsMd('x'.repeat(100), 8).length).toBeLessThanOrEqual(8)
  })
})
