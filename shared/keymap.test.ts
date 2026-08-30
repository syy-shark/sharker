import { describe, expect, it } from 'vitest'
import {
  chordsMatch,
  effectiveShortcutChords,
  encodeShortcutChord,
  formatShortcutChord,
  isInterruptTurnRemapped,
  matchWorkbenchShortcut,
  normalizeKeymap,
  persistShortcutChords,
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
    expect(isInterruptTurnRemapped({ interrupt_turn: 'f12' })).toBe(true)
    expect(isInterruptTurnRemapped({ interrupt_turn: '' })).toBe(false)
    expect(isInterruptTurnRemapped()).toBe(false)
  })

  it('keeps several accelerators on one command the way Codex desktop does', () => {
    expect(effectiveShortcutChords('new_conversation')).toEqual(['mod+n', 'mod+shift+o'])
    expect(persistShortcutChords(['mod+n', 'mod+shift+k'])).toEqual(['mod+n', 'mod+shift+k'])
    const overrides = normalizeKeymap({
      new_conversation: ['mod+n', 'mod+shift+k']
    })
    expect(effectiveShortcutChords('new_conversation', overrides)).toEqual(['mod+n', 'mod+shift+k'])
    expect(matchWorkbenchShortcut(ev({ key: 'n', metaKey: true }), overrides)).toBe(
      'new_conversation'
    )
    expect(
      matchWorkbenchShortcut(ev({ key: 'k', metaKey: true, shiftKey: true }), overrides)
    ).toBe('new_conversation')
    expect(
      matchWorkbenchShortcut(ev({ key: 'o', metaKey: true, shiftKey: true }), overrides)
    ).toBeNull()
    expect(
      shouldInterruptTurn(ev({ key: 'F12' }), { interrupt_turn: ['f12', 'mod+escape'] })
    ).toBe(true)
    expect(
      shouldInterruptTurn(ev({ key: 'Escape', metaKey: true }), {
        interrupt_turn: ['f12', 'mod+escape']
      })
    ).toBe(true)
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
