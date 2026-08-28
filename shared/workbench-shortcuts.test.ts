import { describe, expect, it } from 'vitest'
import { matchWorkbenchShortcut } from './workbench-shortcuts'

function ev(partial: {
  key: string
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
  })

  it('ignores composing and unmodified keys', () => {
    expect(matchWorkbenchShortcut(ev({ key: 'b', metaKey: true, isComposing: true }))).toBeNull()
    expect(matchWorkbenchShortcut(ev({ key: 'b' }))).toBeNull()
  })
})
