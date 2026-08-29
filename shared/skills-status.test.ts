import { describe, expect, it } from 'vitest'
import {
  filterSkillExplorerItems,
  formatSkillsStatus,
  mergeSkillsAcrossProjects
} from './skills-status'

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
    const merged = mergeSkillsAcrossProjects([
      {
        workspaceId: 'p1',
        workspaceLabel: '前端',
        skills: [
          { name: 'review', description: '审查 diff' },
          { name: 'docs', description: '写文档' }
        ]
      },
      {
        workspaceId: 'p2',
        workspaceLabel: '后端',
        skills: [{ name: 'review', description: '审查 diff' }]
      }
    ])
    expect(merged.map((s) => s.name)).toEqual(['docs', 'review'])
    expect(merged.find((s) => s.name === 'review')?.workspaces.map((w) => w.label)).toEqual([
      '前端',
      '后端'
    ])
    expect(filterSkillExplorerItems(merged, '后端').map((s) => s.name)).toEqual(['review'])
    expect(filterSkillExplorerItems(merged, '文档').map((s) => s.name)).toEqual(['docs'])
  })
})
