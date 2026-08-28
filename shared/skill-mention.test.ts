import { describe, expect, it } from 'vitest'
import { filterSkillMentions, insertSkillMention, parseSkillMention } from './skill-mention'

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
})
