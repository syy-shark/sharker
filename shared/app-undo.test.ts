import { describe, expect, it } from 'vitest'
import { createAppUndoStack, isNativeUndoTarget } from './app-undo'

describe('app undo stack', () => {
  it('undoes then redoes the last record and clears redo on push', () => {
    const stack = createAppUndoStack(2)
    stack.push({ kind: 'archive', workspaceId: 'w', conversationId: 'a' })
    stack.push({ kind: 'pin', workspaceId: 'w', conversationId: 'a', afterPinned: true })
    expect(stack.peekUndo()?.kind).toBe('pin')
    expect(stack.popUndo()?.kind).toBe('pin')
    expect(stack.popRedo()?.kind).toBe('pin')
    stack.push({ kind: 'unread', workspaceId: 'w', conversationId: 'b' })
    expect(stack.canRedo()).toBe(false)
    expect(stack.popUndo()?.kind).toBe('unread')
    expect(stack.popUndo()?.kind).toBe('pin')
    expect(stack.popUndo()).toBeUndefined()
  })

  it('drops the oldest record when over the limit', () => {
    const stack = createAppUndoStack(1)
    stack.push({
      kind: 'archive-batch',
      workspaceId: 'w',
      conversationIds: ['a', 'c']
    })
    stack.push({ kind: 'archive', workspaceId: 'w', conversationId: 'b' })
    expect(stack.popUndo()).toEqual({
      kind: 'archive',
      workspaceId: 'w',
      conversationId: 'b'
    })
    expect(stack.popUndo()).toBeUndefined()
  })
})

describe('native undo target', () => {
  it('treats missing targets as app-undoable', () => {
    expect(isNativeUndoTarget(null)).toBe(false)
  })
})
