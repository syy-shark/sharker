import { describe, expect, it } from 'vitest'
import { formatSkillsStatus } from './skills-status'

describe('skills status', () => {
  it('lists and filters skills', () => {
    const items = [
      { name: 'review', description: '审查 diff' },
      { name: 'docs', description: '写文档' }
    ]
    expect(formatSkillsStatus(items)).toContain('$review')
    expect(formatSkillsStatus(items, '文档')).toContain('$docs')
    expect(formatSkillsStatus(items, '文档')).not.toContain('$review')
    expect(formatSkillsStatus([], 'zzz')).toContain('没有匹配')
  })
})
