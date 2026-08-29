/**
 * 官方 update_plan 参数与直播文案。
 * @see shared/update-plan.ts
 */
import { describe, expect, it } from 'vitest'
import { isToolAllowedInPlanMode } from '../tools/tool-groups'
import { getAllBuiltinTools } from '../tools/registry'
import {
  assertUpdatePlanArgs,
  formatUpdatePlanActivity,
  formatUpdatePlanToolOutput,
  IMPLEMENT_PLAN_NO,
  IMPLEMENT_PLAN_PROMPT,
  IMPLEMENT_PLAN_YES,
  parsePlanStepStatus,
  parseUpdatePlanArgs,
  PROPOSED_PLAN_TITLE
} from './update-plan'

describe('update-plan', () => {
  it('parses official plan items and keeps the tool result short', () => {
    expect(parsePlanStepStatus('IN_PROGRESS')).toBe('in_progress')
    expect(parsePlanStepStatus('done')).toBe('completed')
    expect(parsePlanStepStatus('nope')).toBe('pending')
    expect(formatUpdatePlanToolOutput()).toBe('Plan updated')
    expect(parseUpdatePlanArgs(undefined).plan).toEqual([])
    expect(() => assertUpdatePlanArgs({})).toThrow(/plan is required/)
    const parsed = parseUpdatePlanArgs({
      explanation: 'Start with types',
      plan: [
        { step: 'Add types', status: 'completed' },
        { step: 'Wire tool', status: 'in_progress' },
        { step: '  ', status: 'pending' },
        { step: 'Render list', status: 'pending' }
      ]
    })
    expect(parsed.explanation).toBe('Start with types')
    expect(parsed.plan).toEqual([
      { step: 'Add types', status: 'completed' },
      { step: 'Wire tool', status: 'in_progress' },
      { step: 'Render list', status: 'pending' }
    ])
    expect(formatUpdatePlanActivity({ plan: parsed.plan }, 'active')).toBe('Wire tool')
    expect(formatUpdatePlanActivity({ plan: parsed.plan }, 'done')).toBe('Plan · 1/3')
    expect(PROPOSED_PLAN_TITLE).toBe('Proposed Plan')
    expect(IMPLEMENT_PLAN_PROMPT).toBe('Implement this plan?')
    expect(IMPLEMENT_PLAN_YES).toBe('Yes, implement this plan')
    expect(IMPLEMENT_PLAN_NO).toBe('No, tell Codex how to adjust')
    expect(getAllBuiltinTools().some((tool) => tool.name === 'update_plan')).toBe(true)
    expect(isToolAllowedInPlanMode('update_plan')).toBe(true)
  })
})
