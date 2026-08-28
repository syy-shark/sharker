import { describe, expect, it } from 'vitest'
import { matchSlashCommand } from './commands'

describe('slash command matching', () => {
  it('treats /plan-mode as /plan', () => {
    const plan = matchSlashCommand('/plan 修好滚动')
    const alias = matchSlashCommand('/plan-mode 修好滚动')
    expect(plan?.shouldQuery).toBe(true)
    expect(alias?.rewrittenText).toBe(plan?.rewrittenText)
    expect(alias?.rewrittenText).toContain('用户补充：修好滚动')
  })
})
