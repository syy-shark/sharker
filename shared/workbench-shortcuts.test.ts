import { describe, expect, it } from 'vitest'
import {
  adjacentConversationId,
  isEmbeddedTerminalTarget,
  isTerminalClearChord,
  matchDefaultWorkbenchShortcut
} from './workbench-shortcuts'
import { matchWorkbenchShortcut } from './keymap'

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

describe('workbench shortcuts', () => {
  it('maps Codex-class chords', () => {
    expect(matchWorkbenchShortcut(ev({ key: 'b', metaKey: true }))).toBe('toggle_sidebar')
    expect(matchWorkbenchShortcut(ev({ key: 'b', metaKey: true, altKey: true }))).toBe(
      'toggle_review'
    )
    expect(matchWorkbenchShortcut(ev({ key: 'g', ctrlKey: true, shiftKey: true }))).toBe(
      'toggle_review'
    )
    expect(matchWorkbenchShortcut(ev({ key: 'g', metaKey: true, shiftKey: true }))).toBeNull()
    expect(matchWorkbenchShortcut(ev({ key: 'z', metaKey: true }))).toBe('undo_app')
    expect(matchWorkbenchShortcut(ev({ key: 'z', metaKey: true, shiftKey: true }))).toBe(
      'redo_app'
    )
    expect(matchWorkbenchShortcut(ev({ key: 'j', metaKey: true }))).toBe('toggle_panel')
    expect(matchWorkbenchShortcut(ev({ key: 'n', metaKey: true }))).toBe('new_conversation')
    expect(matchWorkbenchShortcut(ev({ key: 'o', metaKey: true, shiftKey: true }))).toBe(
      'new_conversation'
    )
    expect(matchWorkbenchShortcut(ev({ key: ',', metaKey: true }))).toBe('open_settings')
    expect(matchWorkbenchShortcut(ev({ key: 'k', metaKey: true }))).toBe('command_palette')
    expect(matchWorkbenchShortcut(ev({ key: 'p', metaKey: true, shiftKey: true }))).toBe(
      'command_palette'
    )
    expect(
      matchWorkbenchShortcut(ev({ key: '{', code: 'BracketLeft', metaKey: true, shiftKey: true }))
    ).toBe('prev_thread')
    expect(
      matchWorkbenchShortcut(ev({ key: '}', code: 'BracketRight', metaKey: true, shiftKey: true }))
    ).toBe('next_thread')
    expect(matchWorkbenchShortcut(ev({ key: 'e', metaKey: true, shiftKey: true }))).toBe(
      'toggle_files'
    )
    expect(matchWorkbenchShortcut(ev({ key: 'b', metaKey: true, shiftKey: true }))).toBe(
      'toggle_browser'
    )
    expect(matchWorkbenchShortcut(ev({ key: '/', metaKey: true }))).toBe('shortcut_help')
    expect(matchWorkbenchShortcut(ev({ key: 'o', ctrlKey: true }))).toBe('copy_last_output')
    expect(matchWorkbenchShortcut(ev({ key: 'o', metaKey: true }))).toBe('open_folder')
    expect(matchWorkbenchShortcut(ev({ key: ',', altKey: true }))).toBe('thinking_lower')
    expect(matchWorkbenchShortcut(ev({ key: '.', altKey: true }))).toBe('thinking_higher')
    expect(matchWorkbenchShortcut(ev({ key: '?', metaKey: true, shiftKey: true }))).toBe(
      'shortcut_help'
    )
    expect(matchWorkbenchShortcut(ev({ key: '3', metaKey: true }))).toBe('select_chat')
    expect(matchWorkbenchShortcut(ev({ key: '`', ctrlKey: true }))).toBe('toggle_terminal')
    expect(matchWorkbenchShortcut(ev({ key: '`', metaKey: true }))).toBe('toggle_terminal')
    expect(matchWorkbenchShortcut(ev({ key: 'j', ctrlKey: true }))).toBe('toggle_panel')
    expect(matchWorkbenchShortcut(ev({ key: 'g', metaKey: true }))).toBe('search_chats')
    expect(matchWorkbenchShortcut(ev({ key: 'u', metaKey: true, altKey: true }))).toBe(
      'toggle_activity'
    )
    expect(
      matchWorkbenchShortcut(ev({ key: 'u', metaKey: true, altKey: true, shiftKey: true }))
    ).toBe('toggle_agents')
    expect(matchWorkbenchShortcut(ev({ key: '=', metaKey: true }))).toBe('font_larger')
    expect(matchWorkbenchShortcut(ev({ key: '-', metaKey: true }))).toBe('font_smaller')
    expect(matchWorkbenchShortcut(ev({ key: '0', metaKey: true }))).toBe('font_reset')
    expect(matchWorkbenchShortcut(ev({ key: 'y', ctrlKey: true }))).toBe('redo_app')
    expect(
      matchWorkbenchShortcut(ev({ key: '-', code: 'NumpadSubtract', metaKey: true }))
    ).toBe('font_smaller')
    expect(matchWorkbenchShortcut(ev({ key: '0', code: 'Numpad0', metaKey: true }))).toBe(
      'font_reset'
    )
    expect(matchWorkbenchShortcut(ev({ key: '[', code: 'BracketLeft', metaKey: true }))).toBe(
      'nav_back'
    )
    expect(matchWorkbenchShortcut(ev({ key: ']', code: 'BracketRight', metaKey: true }))).toBe(
      'nav_forward'
    )
    expect(matchWorkbenchShortcut(ev({ key: 'l', ctrlKey: true }))).toBe('clear_terminal')
    expect(
      matchWorkbenchShortcut(ev({ key: '[', code: 'BracketLeft', metaKey: true, shiftKey: true }))
    ).toBe('prev_thread')
    expect(matchWorkbenchShortcut(ev({ key: 'Escape', shiftKey: true }))).toBe('clear_unread')
    expect(matchWorkbenchShortcut(ev({ key: 'a', metaKey: true, shiftKey: true }))).toBe(
      'archive_thread'
    )
    expect(matchWorkbenchShortcut(ev({ key: 's', metaKey: true, altKey: true }))).toBe(
      'side_conversation'
    )
    expect(matchWorkbenchShortcut(ev({ key: 'a', metaKey: true, altKey: true }))).toBe(
      'next_attention'
    )
    expect(matchWorkbenchShortcut(ev({ key: 'p', metaKey: true }))).toBe('search_files')
    expect(matchWorkbenchShortcut(ev({ key: 't', metaKey: true }))).toBe('open_browser')
    expect(matchWorkbenchShortcut(ev({ key: 'o', metaKey: true, altKey: true }))).toBe(
      'standalone_conversation'
    )
    expect(matchWorkbenchShortcut(ev({ key: 'n', metaKey: true, altKey: true }))).toBe(
      'standalone_conversation'
    )
    expect(
      matchWorkbenchShortcut(ev({ key: 'o', metaKey: true, altKey: true, shiftKey: true }))
    ).toBe('open_project_picker')
    expect(matchWorkbenchShortcut(ev({ key: 'r', metaKey: true, altKey: true }))).toBe(
      'rename_conversation'
    )
    expect(matchWorkbenchShortcut(ev({ key: 'p', metaKey: true, altKey: true }))).toBe(
      'pin_conversation'
    )
    expect(matchWorkbenchShortcut(ev({ key: 'u', metaKey: true, shiftKey: true }))).toBe(
      'mark_unread'
    )
    expect(matchWorkbenchShortcut(ev({ key: 'c', metaKey: true, shiftKey: true }))).toBe(
      'copy_cwd'
    )
    expect(matchWorkbenchShortcut(ev({ key: 'c', metaKey: true, altKey: true }))).toBe(
      'copy_session_id'
    )
    expect(
      matchWorkbenchShortcut(ev({ key: 'c', metaKey: true, altKey: true, shiftKey: true }))
    ).toBe('copy_conversation_path')
    expect(matchWorkbenchShortcut(ev({ key: 'l', metaKey: true, altKey: true }))).toBe(
      'copy_deep_link'
    )
    expect(matchDefaultWorkbenchShortcut(ev({ key: '2', metaKey: true, altKey: true }))).toBe(
      'select_recent'
    )
    expect(matchDefaultWorkbenchShortcut(ev({ key: 'ArrowLeft', metaKey: true, altKey: true }))).toBe(
      'prev_thread'
    )
    expect(matchWorkbenchShortcut(ev({ key: 'Tab', ctrlKey: true }))).toBe('next_thread')
    expect(matchWorkbenchShortcut(ev({ key: 'Tab', ctrlKey: true, shiftKey: true }))).toBe(
      'prev_thread'
    )
    expect(matchWorkbenchShortcut(ev({ key: 'Tab', metaKey: true }))).toBeNull()
    expect(matchWorkbenchShortcut(ev({ key: 'PageDown', ctrlKey: true }))).toBe('next_thread')
    expect(matchWorkbenchShortcut(ev({ key: 'PageUp', ctrlKey: true }))).toBe('prev_thread')
  })

  it('cycles conversation ids', () => {
    expect(adjacentConversationId(['a', 'b', 'c'], 'b', 1)).toBe('c')
    expect(adjacentConversationId(['a', 'b', 'c'], 'a', -1)).toBe('c')
    expect(adjacentConversationId([], 'a', 1)).toBeNull()
  })

  it('treats ⌘K as a terminal clear chord only without Shift', () => {
    expect(isTerminalClearChord(ev({ key: 'k', metaKey: true }))).toBe(true)
    expect(isTerminalClearChord(ev({ key: 'k', ctrlKey: true }))).toBe(true)
    expect(isTerminalClearChord(ev({ key: 'k', metaKey: true, shiftKey: true }))).toBe(false)
    expect(isTerminalClearChord(ev({ key: 'p', metaKey: true, shiftKey: true }))).toBe(false)
  })

  it('detects xterm hosts as the embedded terminal', () => {
    const inside = {
      closest: (sel: string) =>
        sel.includes('embedded-terminal-shell') ? {} : null
    }
    const outside = { closest: () => null }
    expect(isEmbeddedTerminalTarget(inside as unknown as EventTarget)).toBe(true)
    expect(isEmbeddedTerminalTarget(outside as unknown as EventTarget)).toBe(false)
    expect(isEmbeddedTerminalTarget(null)).toBe(false)
  })

  it('ignores composing and unmodified keys', () => {
    expect(matchWorkbenchShortcut(ev({ key: 'b', metaKey: true, isComposing: true }))).toBeNull()
    expect(matchWorkbenchShortcut(ev({ key: 'b' }))).toBeNull()
  })
})
