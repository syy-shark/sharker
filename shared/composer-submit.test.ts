import { describe, expect, it } from 'vitest'
import {
  collectUserPrompts,
  filterPromptHistory,
  isDoubleEscape,
  lastUserMessageId,
  lastUserPrompt,
  isFollowUpInvertChord,
  parseComposerEnterBehavior,
  parseFollowUpBehavior,
  resolveApprovalHotkey,
  resolveComposerSubmit,
  restorePreviousComposerPrompt,
  shouldEditLastUserOnEscape
} from './composer-submit'

describe('composer submit', () => {
  it('approves or denies when an approval card is open', () => {
    expect(
      resolveApprovalHotkey({ approvalOpen: true, key: 'Enter' })
    ).toBe('once')
    expect(resolveApprovalHotkey({ approvalOpen: true, key: 'Escape' })).toBe('deny')
    expect(
      resolveApprovalHotkey({ approvalOpen: true, key: 'Enter', shiftKey: true })
    ).toBeNull()
    expect(
      resolveApprovalHotkey({ approvalOpen: true, key: 'Enter', menuOpen: true })
    ).toBeNull()
    expect(resolveApprovalHotkey({ approvalOpen: false, key: 'Enter' })).toBeNull()
    expect(
      resolveApprovalHotkey({ approvalOpen: true, responding: true, key: 'Escape' })
    ).toBeNull()
  })

  it('sends on Enter when idle and queues when busy by default', () => {
    expect(resolveComposerSubmit({ key: 'Enter', loading: false })).toBe('send')
    expect(resolveComposerSubmit({ key: 'Enter', loading: true })).toBe('queue')
    expect(resolveComposerSubmit({ key: 'Enter', loading: true, followUpBehavior: 'steer' })).toBe(
      'jump'
    )
    expect(parseFollowUpBehavior(undefined)).toBe('queue')
    expect(parseFollowUpBehavior('steer')).toBe('steer')
  })

  it('inverts follow-up with Cmd+Shift+Enter while a turn is running', () => {
    expect(isFollowUpInvertChord({ key: 'Enter', shiftKey: true, metaKey: true })).toBe(true)
    expect(
      resolveComposerSubmit({
        key: 'Enter',
        shiftKey: true,
        metaKey: true,
        loading: true
      })
    ).toBe('jump')
    expect(
      resolveComposerSubmit({
        key: 'Enter',
        shiftKey: true,
        ctrlKey: true,
        loading: true,
        followUpBehavior: 'steer'
      })
    ).toBe('queue')
    expect(
      resolveComposerSubmit({
        key: 'Enter',
        shiftKey: true,
        metaKey: true,
        loading: false
      })
    ).toBe('send')
  })

  it('requires Cmd+Enter to send when that setting is on', () => {
    expect(resolveComposerSubmit({ key: 'Enter', loading: false, requireModEnter: true })).toBeNull()
    expect(
      resolveComposerSubmit({
        key: 'Enter',
        metaKey: true,
        loading: false,
        requireModEnter: true
      })
    ).toBe('send')
    expect(
      resolveComposerSubmit({
        key: 'Enter',
        loading: true,
        requireModEnter: true
      })
    ).toBeNull()
    expect(
      resolveComposerSubmit({
        key: 'Enter',
        metaKey: true,
        loading: true,
        requireModEnter: true
      })
    ).toBe('queue')
    expect(parseComposerEnterBehavior(undefined, true)).toBe('cmdAlways')
    expect(parseComposerEnterBehavior('cmdIfMultiline', true)).toBe('cmdIfMultiline')
    expect(
      resolveComposerSubmit({
        key: 'Enter',
        loading: false,
        enterBehavior: 'cmdIfMultiline'
      })
    ).toBe('send')
    expect(
      resolveComposerSubmit({
        key: 'Enter',
        loading: false,
        enterBehavior: 'cmdIfMultiline',
        multiline: true
      })
    ).toBeNull()
    expect(
      resolveComposerSubmit({
        key: 'Enter',
        metaKey: true,
        loading: false,
        enterBehavior: 'cmdIfMultiline',
        multiline: true
      })
    ).toBe('send')
    expect(
      resolveComposerSubmit({
        key: 'Enter',
        loading: true,
        enterBehavior: 'cmdIfMultiline',
        multiline: true
      })
    ).toBeNull()
    expect(
      resolveComposerSubmit({
        key: 'Enter',
        ctrlKey: true,
        loading: true,
        enterBehavior: 'cmdAlways'
      })
    ).toBe('queue')
  })

  it('queues on Tab only while a turn is running', () => {
    expect(resolveComposerSubmit({ key: 'Tab', loading: true })).toBe('queue')
    expect(resolveComposerSubmit({ key: 'Tab', loading: false })).toBeNull()
    expect(resolveComposerSubmit({ key: 'Tab', loading: true, ctrlKey: true })).toBeNull()
    expect(resolveComposerSubmit({ key: 'Tab', loading: true, metaKey: true })).toBeNull()
  })

  it('ignores menus, Shift+Enter, and other keys', () => {
    expect(resolveComposerSubmit({ key: 'Enter', loading: true, menuOpen: true })).toBeNull()
    expect(resolveComposerSubmit({ key: 'Enter', loading: false, shiftKey: true })).toBeNull()
    expect(resolveComposerSubmit({ key: 'Escape', loading: true })).toBeNull()
  })

  it('restores the last user prompt only when the composer is empty', () => {
    const messages = [
      { role: 'user', content: '先看滚动' },
      { role: 'assistant', content: '好' },
      { role: 'user', content: '再修卡顿' }
    ]
    expect(restorePreviousComposerPrompt({ input: '', messages })).toBe('再修卡顿')
    expect(restorePreviousComposerPrompt({ input: 'x', messages })).toBeNull()
    expect(restorePreviousComposerPrompt({ input: '', messages: [] })).toBeNull()
  })

  it('lists and filters prompt history for Ctrl+R', () => {
    const messages = [
      { role: 'user', content: '先看滚动' },
      { role: 'user', content: '先看滚动' },
      { role: 'assistant', content: '好' },
      { role: 'user', content: '再修卡顿' }
    ]
    expect(lastUserPrompt(messages)).toBe('再修卡顿')
    expect(collectUserPrompts(messages)).toEqual(['再修卡顿', '先看滚动'])
    expect(filterPromptHistory(collectUserPrompts(messages), '滚动')).toEqual(['先看滚动'])
    expect(isDoubleEscape(1000, 1300)).toBe(true)
    expect(isDoubleEscape(1000, 1600)).toBe(false)
  })

  it('uses Esc Esc on an empty composer to edit the last user turn', () => {
    const messages = [
      { id: 'u1', role: 'user', content: '先看滚动' },
      { id: 'a1', role: 'assistant', content: '好' },
      { id: 'u2', role: 'user', content: '再修卡顿' }
    ]
    expect(lastUserMessageId(messages)).toBe('u2')
    expect(lastUserMessageId([])).toBeNull()
    expect(
      shouldEditLastUserOnEscape({
        input: '',
        loading: false,
        prevEscAt: 1000,
        now: 1300
      })
    ).toBe(true)
    expect(
      shouldEditLastUserOnEscape({
        input: '草稿',
        loading: false,
        prevEscAt: 1000,
        now: 1300
      })
    ).toBe(false)
    expect(
      shouldEditLastUserOnEscape({
        input: '',
        loading: true,
        prevEscAt: 1000,
        now: 1300
      })
    ).toBe(false)
  })
})
