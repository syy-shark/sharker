import { describe, expect, it } from 'vitest'
import {
  ALLOW_FOR_SESSION_LABEL,
  ALLOW_ONCE_LABEL,
  approvalActionLabel,
  ConversationApprovalRegistry,
  DENY_LABEL,
  SessionApprovalStore,
  formatApproveRetry,
  isApprovalGranted,
  matchKeyForApproval,
  normalizeApprovalDecision,
  resolveSessionGrant
} from './approval-session'

describe('approval decision enforcement (once / session / deny)', () => {
  it('normalizes legacy boolean and string decisions', () => {
    expect(normalizeApprovalDecision(true)).toBe('once')
    expect(normalizeApprovalDecision(false)).toBe('deny')
    expect(normalizeApprovalDecision('session')).toBe('session')
    expect(normalizeApprovalDecision('once')).toBe('once')
    expect(normalizeApprovalDecision('deny')).toBe('deny')
    expect(normalizeApprovalDecision(null)).toBe('deny')
    expect(ALLOW_ONCE_LABEL).toBe('Allow once')
    expect(ALLOW_FOR_SESSION_LABEL).toBe('Allow for session')
    expect(DENY_LABEL).toBe('Deny')
    expect(approvalActionLabel('once')).toBe('Allow once')
    expect(approvalActionLabel('session')).toBe('Allow for session')
    expect(approvalActionLabel('deny')).toBe('Deny')
  })

  it('once grants only that request — does not skip later approvals', () => {
    const store = new SessionApprovalStore()
    const tool = 'run_terminal_cmd'
    const args = { command: 'rm -rf build' }

    expect(store.isGranted(tool, args)).toBe(false)
    expect(resolveSessionGrant(store, tool, args)).toBeNull()

    const first = store.applyDecision('once', tool, args)
    expect(first).toBe(true)
    expect(isApprovalGranted('once')).toBe(true)
    // once 不写入 session 表
    expect(store.isGranted(tool, args)).toBe(false)
    expect(resolveSessionGrant(store, tool, args)).toBeNull()
    expect(store.size).toBe(0)

    // 同工具再次仍需询问
    const secondWouldNeedUi = resolveSessionGrant(store, tool, args)
    expect(secondWouldNeedUi).toBeNull()
  })

  it('session grant skips later matching approvals in the same session', () => {
    const store = new SessionApprovalStore()
    const tool = 'run_terminal_cmd'

    const allowed = store.applyDecision('session', tool, { command: 'npm test' })
    expect(allowed).toBe(true)
    expect(store.isGranted(tool, { command: 'npm test' })).toBe(true)
    // 同 tool 不同 args 仍匹配（session 按 toolName）
    expect(store.isGranted(tool, { command: 'npm run build' })).toBe(true)
    expect(resolveSessionGrant(store, tool, { command: 'other' })).toBe('session')
    expect(matchKeyForApproval(tool)).toBe(tool)

    // 其他工具仍未授权
    expect(store.isGranted('write_file', { path: 'a.ts' })).toBe(false)
    expect(resolveSessionGrant(store, 'write_file', { path: 'a.ts' })).toBeNull()
  })

  it('deny rejects and does not grant', () => {
    const store = new SessionApprovalStore()
    const tool = 'delete_path'
    const ok = store.applyDecision('deny', tool, { path: '/tmp/x' })
    expect(ok).toBe(false)
    expect(isApprovalGranted('deny')).toBe(false)
    expect(store.isGranted(tool)).toBe(false)
    expect(store.size).toBe(0)

    // 先 deny 再 once：仅当次，仍无 session
    expect(store.applyDecision(false, tool, {})).toBe(false)
    expect(store.applyDecision(true, tool, {})).toBe(true)
    expect(store.isGranted(tool)).toBe(false)
  })

  it('isolates session grants per conversation id', () => {
    const registry = new ConversationApprovalRegistry()
    const a = registry.get('conv-a')
    const b = registry.get('conv-b')
    a.applyDecision('session', 'run_terminal_cmd', {})
    expect(a.isGranted('run_terminal_cmd')).toBe(true)
    expect(b.isGranted('run_terminal_cmd')).toBe(false)
    registry.clear('conv-a')
    expect(registry.get('conv-a').isGranted('run_terminal_cmd')).toBe(false)
  })

  it('queues one /approve retry after a recorded denial', () => {
    const store = new SessionApprovalStore()
    expect(store.queueApproveOnce().ok).toBe(false)
    expect(formatApproveRetry({ ok: false, denial: null })).toContain('没有可重试')
    store.recordDenial('run_terminal_cmd', '删除工作区外文件')
    expect(store.getLastDenied()?.toolName).toBe('run_terminal_cmd')
    const queued = store.queueApproveOnce()
    expect(queued.ok).toBe(true)
    expect(resolveSessionGrant(store, 'run_terminal_cmd')).toBe('once')
    expect(resolveSessionGrant(store, 'run_terminal_cmd')).toBeNull()
    expect(formatApproveRetry(queued)).toContain('run_terminal_cmd')
  })
})
