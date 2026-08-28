import { describe, expect, it } from 'vitest'
import { adjacentConversationId, matchWorkbenchShortcut } from './workbench-shortcuts'

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
    expect(matchWorkbenchShortcut(ev({ key: 'j', metaKey: true }))).toBe('toggle_terminal')
    expect(matchWorkbenchShortcut(ev({ key: 'n', metaKey: true }))).toBe('new_conversation')
    expect(matchWorkbenchShortcut(ev({ key: ',', metaKey: true }))).toBe('open_settings')
    expect(matchWorkbenchShortcut(ev({ key: 'o', ctrlKey: true }))).toBe('open_folder')
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
  })

  it('cycles conversation ids', () => {
    expect(adjacentConversationId(['a', 'b', 'c'], 'b', 1)).toBe('c')
    expect(adjacentConversationId(['a', 'b', 'c'], 'a', -1)).toBe('c')
    expect(adjacentConversationId([], 'a', 1)).toBeNull()
  })

  it('ignores composing and unmodified keys', () => {
    expect(matchWorkbenchShortcut(ev({ key: 'b', metaKey: true, isComposing: true }))).toBeNull()
    expect(matchWorkbenchShortcut(ev({ key: 'b' }))).toBeNull()
  })
})
