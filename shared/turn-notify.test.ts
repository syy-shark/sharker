import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ALWAYS_TURN_COMPLETION_LABEL,
  NEVER_TURN_COMPLETION_LABEL,
  NOTIFICATION_PERMISSION_DESCRIPTION,
  ONLY_WHILE_IN_THE_BACKGROUND_LABEL,
  PERMISSION_AND_QUESTION_NOTIFICATIONS_DESCRIPTION,
  parseTurnNotifyMode,
  shouldMarkConversationUnread,
  shouldNotifyApproval,
  shouldNotifyTurnComplete,
  formatChangedFilesLabel,
  turnNotifyBody,
  turnNotifyPreview,
  turnNotifyTitle,
  unreadDockBadgeCount
} from './turn-notify'

describe('background turn notifications', () => {
  it('does not notify the focused visible chat', () => {
    expect(
      shouldNotifyTurnComplete({
        conversationId: 'a',
        activeConversationId: 'a',
        page: 'chat',
        windowFocused: true,
        outcome: 'success'
      })
    ).toBe(false)
  })

  it('notifies when the window is blurred even on the same chat', () => {
    expect(
      shouldNotifyTurnComplete({
        conversationId: 'a',
        activeConversationId: 'a',
        page: 'chat',
        windowFocused: false,
        outcome: 'success'
      })
    ).toBe(true)
  })

  it('notifies another conversation while the app is focused', () => {
    expect(
      shouldNotifyTurnComplete({
        conversationId: 'bg',
        activeConversationId: 'fg',
        page: 'chat',
        windowFocused: true,
        outcome: 'success'
      })
    ).toBe(true)
  })

  it('honors never and always notify modes', () => {
    const base = {
      conversationId: 'a',
      activeConversationId: 'a',
      page: 'chat' as const,
      windowFocused: true,
      outcome: 'success' as const
    }
    expect(shouldNotifyTurnComplete({ ...base, mode: 'never' })).toBe(false)
    expect(shouldNotifyTurnComplete({ ...base, mode: 'always' })).toBe(true)
    expect(parseTurnNotifyMode('always')).toBe('always')
    expect(parseTurnNotifyMode('')).toBe('background')
  })

  it('notifies approvals only when not watching the focused chat', () => {
    const base = {
      conversationId: 'a',
      activeConversationId: 'a',
      page: 'chat' as const,
      windowFocused: true
    }
    expect(shouldNotifyApproval(base)).toBe(false)
    expect(shouldNotifyApproval({ ...base, windowFocused: false })).toBe(true)
    expect(shouldNotifyApproval({ ...base, conversationId: 'bg' })).toBe(true)
    expect(shouldNotifyApproval({ ...base, enabled: false, windowFocused: false })).toBe(false)
  })

  it('skips aborted turns', () => {
    expect(
      shouldNotifyTurnComplete({
        conversationId: 'a',
        activeConversationId: 'b',
        page: 'chat',
        windowFocused: true,
        outcome: 'aborted'
      })
    ).toBe(false)
  })

  it('marks unread when the user is on settings or another thread', () => {
    expect(
      shouldMarkConversationUnread({
        conversationId: 'a',
        activeConversationId: 'a',
        page: 'settings'
      })
    ).toBe(true)
    expect(
      shouldMarkConversationUnread({
        conversationId: 'a',
        activeConversationId: 'b',
        page: 'chat'
      })
    ).toBe(true)
    expect(
      shouldMarkConversationUnread({
        conversationId: 'a',
        activeConversationId: 'a',
        page: 'chat'
      })
    ).toBe(false)
  })

  it('builds title and preview', () => {
    expect(turnNotifyTitle({ customTitle: '登录页', title: '新对话' })).toBe('登录页')
    expect(turnNotifyTitle({ title: '新对话' })).toBe('新对话')
    expect(turnNotifyTitle({ title: 'New chat' })).toBe('New chat')
    expect(turnNotifyPreview('  已完成\n\n下一步  ')).toBe('已完成 下一步')
    expect(turnNotifyPreview('x'.repeat(200)).endsWith('…')).toBe(true)
    expect(turnNotifyPreview('')).toBe('回合已完成')
    expect(turnNotifyBody('已完成', 3)).toBe('已完成 · 改了 3 个文件')
    expect(turnNotifyBody('已完成', 0)).toBe('已完成')
    expect(formatChangedFilesLabel(3)).toBe('Edited 3 files')
    expect(formatChangedFilesLabel(1)).toBe('Edited 1 file')
    expect(formatChangedFilesLabel(0)).toBe('')
  })

  it('counts unread conversations for the dock badge', () => {
    expect(unreadDockBadgeCount([{ unread: true }, { unread: false }, { unread: true }])).toBe(2)
    expect(unreadDockBadgeCount([])).toBe(0)
  })

  it('uses official Notifications option titles', () => {
    expect(NEVER_TURN_COMPLETION_LABEL).toBe('Never')
    expect(ONLY_WHILE_IN_THE_BACKGROUND_LABEL).toBe('Only while ChatGPT is in the background')
    expect(ALWAYS_TURN_COMPLETION_LABEL).toBe('Always')
    expect(PERMISSION_AND_QUESTION_NOTIFICATIONS_DESCRIPTION).toMatch(
      /permission and question notifications/
    )
    expect(NOTIFICATION_PERMISSION_DESCRIPTION).toMatch(/grant notification permission/)
    const settingsSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/settings/NotificationSettings.tsx'),
      'utf8'
    )
    expect(settingsSrc).toContain('NEVER_TURN_COMPLETION_LABEL')
    expect(settingsSrc).toContain('ONLY_WHILE_IN_THE_BACKGROUND_LABEL')
    expect(settingsSrc).toContain('ALWAYS_TURN_COMPLETION_LABEL')
    expect(settingsSrc).toContain('PERMISSION_AND_QUESTION_NOTIFICATIONS_DESCRIPTION')
    expect(settingsSrc).toContain('NOTIFICATION_PERMISSION_DESCRIPTION')
    expect(settingsSrc).not.toContain("title: '从不'")
    expect(settingsSrc).not.toContain("title: '后台'")
    expect(settingsSrc).not.toContain("title: '始终'")
  })
})
