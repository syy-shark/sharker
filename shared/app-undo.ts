/**
 * Codex 式「撤销 / 重做上一次应用操作」（⌘Z / ⌘⇧Z）。
 * 输入框内不拦截，把按键留给系统文本撤销。
 * @see shared/ARCH.md
 */

/** 可撤销的工作台动作（对话元数据，不含发消息 / 删库） */
export type AppUndoRecord =
  | { kind: 'archive'; workspaceId: string; conversationId: string }
  | { kind: 'archive-batch'; workspaceId: string; conversationIds: string[] }
  | { kind: 'pin'; workspaceId: string; conversationId: string; afterPinned: boolean }
  | {
      kind: 'rename'
      workspaceId: string
      conversationId: string
      before?: string
      after?: string
    }
  | { kind: 'unread'; workspaceId: string; conversationId: string }

export type AppUndoStack = {
  push: (record: AppUndoRecord) => void
  popUndo: () => AppUndoRecord | undefined
  popRedo: () => AppUndoRecord | undefined
  canUndo: () => boolean
  canRedo: () => boolean
  peekUndo: () => AppUndoRecord | undefined
}

/** 撤销栈：新动作清空重做支；默认保留 40 步 */
export function createAppUndoStack(limit = 40): AppUndoStack {
  const past: AppUndoRecord[] = []
  const future: AppUndoRecord[] = []
  const cap = Math.max(1, limit)
  return {
    push(record) {
      past.push(record)
      if (past.length > cap) past.shift()
      future.length = 0
    },
    popUndo() {
      const record = past.pop()
      if (record) future.push(record)
      return record
    },
    popRedo() {
      const record = future.pop()
      if (record) past.push(record)
      return record
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    peekUndo: () => past[past.length - 1]
  }
}

/** 输入 / 浏览器 / 终端内走原生撤销，不抢应用动作 */
export function isNativeUndoTarget(target: EventTarget | null): boolean {
  if (!target || typeof HTMLElement === 'undefined') return false
  if (!(target instanceof HTMLElement)) return false
  return Boolean(
    target.closest(
      'textarea, input, [contenteditable], .embedded-browser, .xterm, .cm-editor, .monaco-editor'
    )
  )
}

/** 菜单点撤销时：文本控件走 document.execCommand */
export function execNativeUndoRedo(kind: 'undo' | 'redo'): boolean {
  try {
    return document.execCommand(kind)
  } catch {
    return false
  }
}
