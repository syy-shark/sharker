/**
 * 官方 Running / Ran 命令文案。
 * @see shared/exec-activity.ts
 */
import { describe, expect, it } from 'vitest'
import { formatExecActivity, summarizeExecCommand } from './exec-activity'

describe('exec-activity', () => {
  it('keeps short flags and uses Running then Ran', () => {
    expect(summarizeExecCommand('rm -rf /tmp/sharker-apcmd-demo')).toContain('rm -rf')
    expect(formatExecActivity('rm -rf /tmp/sharker-apcmd-demo', 'active')).toBe(
      'Running rm -rf /tmp/sharker-apcmd-demo'
    )
    expect(formatExecActivity('sleep 2', 'done')).toBe('Ran sleep 2')
    expect(formatExecActivity(undefined, 'active')).toBe('Running')
    const long = formatExecActivity(`echo ${'x'.repeat(80)}`, 'active')
    expect(long.startsWith('Running ')).toBe(true)
    expect(long.endsWith('…')).toBe(true)
  })
})
