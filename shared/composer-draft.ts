/**
 * 未发送输入按会话记住（对标 Codex restore unsent prompts when switching tasks）。
 * @see shared/ARCH.md
 */
import type { ChatAttachment } from './types'
import {
  normalizeSelectedTextDraft,
  type SelectedTextPreview
} from './selected-text-preview'

export type ComposerDraftState = {
  text: string
  attachments: ChatAttachment[]
  selectedTexts?: SelectedTextPreview[]
}

const MAX_DRAFTS = 40
const MAX_TEXT = 100_000
const drafts = new Map<string, ComposerDraftState>()

/** 已有对话用 chat:id；尚未建对话的空线程用 new:workspace */
export function composerDraftKey(
  sessionKey?: string | null,
  workspaceId?: string | null
): string {
  const session = sessionKey?.trim()
  if (session) return `chat:${session}`
  const workspace = workspaceId?.trim()
  return workspace ? `new:${workspace}` : ''
}

export function saveComposerDraft(key: string, draft: ComposerDraftState): void {
  if (!key) return
  const text = draft.text.slice(0, MAX_TEXT)
  const attachments = draft.attachments.slice(0, 16)
  const selectedTexts = normalizeSelectedTextDraft(draft.selectedTexts)
  if (!text.trim() && attachments.length === 0 && selectedTexts.length === 0) {
    drafts.delete(key)
    return
  }
  drafts.delete(key)
  drafts.set(key, { text, attachments, selectedTexts })
  while (drafts.size > MAX_DRAFTS) {
    const oldest = drafts.keys().next().value
    if (oldest == null) break
    drafts.delete(oldest)
  }
}

export function loadComposerDraft(key: string): ComposerDraftState {
  return drafts.get(key) ?? { text: '', attachments: [], selectedTexts: [] }
}

export function clearComposerDraft(key: string): void {
  if (key) drafts.delete(key)
}

export function resetComposerDraftsForTest(): void {
  drafts.clear()
}
