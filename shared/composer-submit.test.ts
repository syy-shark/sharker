import { describe, expect, it } from 'vitest'
import { resolveComposerSubmit } from './composer-submit'

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
})
