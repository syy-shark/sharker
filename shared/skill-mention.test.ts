import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  collectBoundSkills,
  filterSkillMentions,
  insertSkillFromAtMention,
  insertSkillMention,
  parseSkillMention,
  removeBoundSkill
} from './skill-mention'

describe('skill mention', () => {
  it('parses $token after whitespace and ignores mid-word dollars', () => {
    expect(parseSkillMention('$rev', 4)).toEqual({ start: 0, query: 'rev' })
    expect(parseSkillMention('用 $code-review', 14)).toEqual({ start: 2, query: 'code-review' })
    expect(parseSkillMention('price$100', 9)).toBeNull()
  })

  it('inserts $name and a trailing space', () => {
    expect(insertSkillMention('$re', 3, 'code-review')).toEqual({
      text: '$code-review ',
      cursor: 13
    })
    expect(insertSkillMention('请用 ', 3, 'debug')).toEqual({
      text: '请用 $debug ',
      cursor: 10
    })
  })

  it('filters by name or description', () => {
    const skills = [
      { name: 'code-review', description: '审查 diff' },
      { name: 'debug', description: '排查运行时问题' }
    ]
    expect(filterSkillMentions(skills, 'rev').map((s) => s.name)).toEqual(['code-review'])
    expect(filterSkillMentions(skills, '排查').map((s) => s.name)).toEqual(['debug'])
  })

  it('inserts skills from the @ menu and lists bound $tokens for chips', () => {
    const skills = [
      { name: 'code-review', description: '审查 diff' },
      { name: 'debug', description: '排查运行时问题' }
    ]
    expect(insertSkillFromAtMention('@co', 3, 'code-review')).toEqual({
      text: '$code-review ',
      cursor: 13
    })
    expect(insertSkillFromAtMention('请用 @d', 6, 'debug')).toEqual({
      text: '请用 $debug ',
      cursor: 10
    })
    expect(collectBoundSkills('请用 $code-review 再 $debug', skills).map((s) => s.name)).toEqual([
      'code-review',
      'debug'
    ])
    expect(collectBoundSkills('price$100 $missing', skills)).toEqual([])
    expect(removeBoundSkill('请用 $code-review 再看', 'code-review')).toBe('请用 再看')
    const composerSrc = readFileSync(
      new URL('../src/components/ComposerDock.tsx', import.meta.url),
      'utf8'
    )
    expect(composerSrc).toContain('SKILLS_LABEL')
    expect(composerSrc).toContain('composer-skill-chip-name')
    expect(composerSrc).toMatch(/\$\{skill\.name\}/)
    expect(composerSrc).not.toContain('composer-skill-chip-desc')
    expect(composerSrc).not.toContain('将使用的 Skill')
  })
})
