import { describe, expect, it } from 'vitest'
import { resolveComposerSubmit, restorePreviousComposerPrompt } from './composer-submit'

describe('composer submit', () => {
  it('sends on Enter when idle and steers when busy', () => {
    expect(resolveComposerSubmit({ key: 'Enter', loading: false })).toBe('send')
    expect(resolveComposerSubmit({ key: 'Enter', loading: true })).toBe('jump')
  })

  it('queues on Tab only while a turn is running', () => {
    expect(resolveComposerSubmit({ key: 'Tab', loading: true })).toBe('queue')
    expect(resolveComposerSubmit({ key: 'Tab', loading: false })).toBeNull()
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
})
