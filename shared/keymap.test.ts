import { describe, expect, it } from 'vitest'
import {
  chordsMatch,
  encodeShortcutChord,
  formatShortcutChord,
  matchWorkbenchShortcut,
  normalizeKeymap,
  interruptTurnChordLabel,
  shouldInterruptTurn
} from './keymap'

function ev(partial: {
  key: string
  code?: string
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  isComposing?: boolean
}) {
  return {
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...partial
  }
}

describe('keymap', () => {
  it('encodes and formats chords', () => {
    expect(
      encodeShortcutChord(ev({ key: 'a', metaKey: true, shiftKey: true }))
    ).toBe('mod+shift+a')
    expect(formatShortcutChord('mod+shift+a')).toBe('⌘⇧A')
    expect(encodeShortcutChord(ev({ key: 'Tab', ctrlKey: true }))).toBe('mod+ctrl+tab')
    expect(formatShortcutChord('mod+ctrl+tab')).toBe('CtrlTab')
    expect(formatShortcutChord('mod+ctrl+shift+tab')).toBe('Ctrl⇧Tab')
    expect(chordsMatch('mod+shift+a', 'shift+mod+A')).toBe(true)
    expect(encodeShortcutChord(ev({ key: 'Meta', metaKey: true }))).toBeNull()
    expect(encodeShortcutChord(ev({ key: 'F12' }))).toBe('f12')
    expect(encodeShortcutChord(ev({ key: 'a' }))).toBeNull()
    expect(formatShortcutChord('f12')).toBe('F12')
    expect(formatShortcutChord('escape')).toBe('Esc')
  })

  it('lets a custom binding win and unbinds the default', () => {
    const overrides = normalizeKeymap({ archive_thread: 'mod+shift+y' })
    expect(
      matchWorkbenchShortcut(ev({ key: 'y', metaKey: true, shiftKey: true }), overrides)
    ).toBe('archive_thread')
    expect(
      matchWorkbenchShortcut(ev({ key: 'a', metaKey: true, shiftKey: true }), overrides)
    ).toBeNull()
    expect(shouldInterruptTurn(ev({ key: 'Escape' }))).toBe(true)
    expect(shouldInterruptTurn(ev({ key: 'Escape', isComposing: true }))).toBe(false)
    expect(shouldInterruptTurn(ev({ key: 'Escape' }), { interrupt_turn: '' })).toBe(false)
    expect(
      shouldInterruptTurn(ev({ key: 'F12' }), normalizeKeymap({ interrupt_turn: 'f12' }))
    ).toBe(true)
    expect(
      shouldInterruptTurn(ev({ key: 'Escape' }), normalizeKeymap({ interrupt_turn: 'f12' }))
    ).toBe(false)
    expect(shouldInterruptTurn({ ...ev({ key: 'Escape' }), keyCode: 229 })).toBe(false)
    expect(interruptTurnChordLabel()).toBe('Esc')
    expect(interruptTurnChordLabel({ interrupt_turn: 'f12' })).toBe('F12')
    expect(interruptTurnChordLabel({ interrupt_turn: '' })).toBeNull()
  })

  it('ignores unknown actions', () => {
    expect(normalizeKeymap({ nope: 'mod+x', pin_conversation: 'mod+alt+p' })).toEqual({
      pin_conversation: 'mod+alt+p'
    })
  })

  it('treats an empty override as an unbind', () => {
    const overrides = normalizeKeymap({ archive_thread: '' })
    expect(
      matchWorkbenchShortcut(ev({ key: 'a', metaKey: true, shiftKey: true }), overrides)
    ).toBeNull()
  })
})
