import { describe, expect, it } from 'vitest'
import {
  shouldMarkConversationUnread,
  shouldNotifyTurnComplete,
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
    expect(turnNotifyPreview('  已完成\n\n下一步  ')).toBe('已完成 下一步')
    expect(turnNotifyPreview('x'.repeat(200)).endsWith('…')).toBe(true)
    expect(turnNotifyPreview('')).toBe('回合已完成')
  })

  it('counts unread conversations for the dock badge', () => {
    expect(unreadDockBadgeCount([{ unread: true }, { unread: false }, { unread: true }])).toBe(2)
    expect(unreadDockBadgeCount([])).toBe(0)
  })
})
