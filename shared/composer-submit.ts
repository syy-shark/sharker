/**
 * Composer 提交键：对标 Codex 桌面端 Follow-up behavior（默认 Queue）与 CLI Tab Queue。
 * 空输入 ↑ 优先恢复刚提交的草稿（取消运行 / 取消 worktree 创建后即使还没进对话）。
 * @see shared/ARCH.md
 */

/** 发送模式（与 UI PromptSubmitMode 对齐） */
export type ComposerSubmitMode = 'send' | 'queue' | 'jump'

/** 忙时后续：排队等到下一回合，或加入当前回合（对标 Codex Follow-up → Steer，不中止） */
export type FollowUpBehavior = 'queue' | 'steer'

/** Official desktop Settings → General → Follow-up behavior (#17285 / #33416). */
export const FOLLOW_UP_BEHAVIOR_LABEL = 'Follow-up behavior'
/** Official desktop composer action while a turn is running. */
export const STEER_LABEL = 'Steer'
/** Official desktop queued follow-up chip / settings option. */
export const QUEUE_LABEL = 'Queue'
/** Official desktop send button when the turn is idle. */
export const SEND_LABEL = 'Send'

export function formatQueueChipLabel(index: number): string {
  return `${QUEUE_LABEL} ${index + 1}`
}

/** Busy composer placeholder: official Queue / Steer names, not TUI section headers. */
export function formatBusyFollowUpPlaceholder(options: {
  followUpBehavior?: FollowUpBehavior
  interruptLabel?: string | null
}): string {
  const follow = parseFollowUpBehavior(options.followUpBehavior)
  const tail = options.interruptLabel ? ` · ${options.interruptLabel} 停止…` : '…'
  if (follow === 'steer') {
    return `Enter ${STEER_LABEL} · ⌘⇧Enter ${QUEUE_LABEL} · Tab ${QUEUE_LABEL}${tail}`
  }
  return `Enter ${QUEUE_LABEL} · ⌘⇧Enter ${STEER_LABEL} · Tab ${QUEUE_LABEL}${tail}`
}

/**
 * Enter 发送（对标 Codex `chatgpt.composerEnterBehavior`）。
 * `enter`：Enter 始终发送；`cmdIfMultiline`：草稿已有换行才要 ⌘/Ctrl+Enter；`cmdAlways`：始终要修饰键。
 */
export type ComposerEnterBehavior = 'enter' | 'cmdIfMultiline' | 'cmdAlways'

/** 设置里未写时按桌面端默认排队 */
export function parseFollowUpBehavior(raw: unknown): FollowUpBehavior {
  return raw === 'steer' ? 'steer' : 'queue'
}

/** 旧布尔 `requireModEnter` 视为 `cmdAlways`；缺省 `enter`（与现网默认一致） */
export function parseComposerEnterBehavior(
  raw: unknown,
  requireModEnter?: unknown
): ComposerEnterBehavior {
  if (raw === 'enter' || raw === 'cmdIfMultiline' || raw === 'cmdAlways') return raw
  return requireModEnter === true ? 'cmdAlways' : 'enter'
}

/** 当前草稿是否要 ⌘/Ctrl+Enter 才发送 */
export function composerNeedsModEnter(
  behavior: ComposerEnterBehavior,
  multiline: boolean
): boolean {
  if (behavior === 'cmdAlways') return true
  if (behavior === 'cmdIfMultiline') return multiline
  return false
}

/** ⌘⇧Enter / Ctrl⇧Enter：单条消息使用另一种后续行为 */
export function isFollowUpInvertChord(options: {
  key: string
  shiftKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
}): boolean {
  if (options.key !== 'Enter') return false
  if (!options.shiftKey || options.altKey) return false
  return Boolean(options.metaKey || options.ctrlKey)
}

/**
 * 输入框在无菜单时的 Enter / Tab。
 * 空闲 Enter 发送（`composerEnterBehavior`：始终 / 多行需修饰键 / 始终修饰键）。
 * 旧布尔 `requireModEnter` 仍按 `cmdAlways` 读。
 * 忙时 Enter 按 `followUpBehavior`（默认 queue）；⌘⇧Enter 反转；Tab 仍排队。
 * Shift+Tab 不排队：输入框内切计划模式（对标 Codex Best practices）。
 * 普通 Shift+Enter 换行。
 */
/** 审批打开时的快捷键（对标 Codex Approve request / Decline request：Enter Allow once，Esc Deny） */
export type ApprovalHotkey = 'once' | 'deny'

export function resolveApprovalHotkey(options: {
  approvalOpen: boolean
  responding?: boolean
  key: string
  shiftKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  menuOpen?: boolean
}): ApprovalHotkey | null {
  if (!options.approvalOpen || options.responding || options.menuOpen) return null
  if (options.altKey) return null
  if (options.key === 'Enter' && !options.shiftKey && !options.metaKey && !options.ctrlKey) {
    return 'once'
  }
  if (options.key === 'Escape') return 'deny'
  return null
}

export function resolveComposerSubmit(options: {
  key: string
  shiftKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  loading: boolean
  menuOpen?: boolean
  followUpBehavior?: FollowUpBehavior
  enterBehavior?: ComposerEnterBehavior
  /** @deprecated 用 `enterBehavior: 'cmdAlways'` */
  requireModEnter?: boolean
  /** 草稿是否已有换行（`cmdIfMultiline` 用） */
  multiline?: boolean
}): ComposerSubmitMode | null {
  if (options.menuOpen) return null
  const follow = parseFollowUpBehavior(options.followUpBehavior)
  const invert = isFollowUpInvertChord(options)
  const mod = Boolean(options.metaKey || options.ctrlKey)
  const enterBehavior = parseComposerEnterBehavior(options.enterBehavior, options.requireModEnter)

  if (options.key === 'Tab') {
    if (options.ctrlKey || options.metaKey || options.altKey || options.shiftKey) return null
    return options.loading ? 'queue' : null
  }

  if (options.key !== 'Enter') return null

  if (invert) {
    if (!options.loading) return 'send'
    return follow === 'steer' ? 'queue' : 'jump'
  }

  if (options.shiftKey) return null
  if (composerNeedsModEnter(enterBehavior, options.multiline === true) && !mod) return null

  if (!options.loading) return 'send'
  return follow === 'steer' ? 'jump' : 'queue'
}

/**
 * 提交后是否贴底并离开 historyHead。
 * 官方 #13698：真正写入对话的发送跳到底（by design）。
 * Queue / Steer 不进 transcript，读历史时保持位置（官方 #38220）。
 */
export function shouldStickAfterComposerSubmit(mode: ComposerSubmitMode): boolean {
  return mode === 'send'
}

/**
 * 忙时排队：斜杠 / bang 先当跟进文本，等当前回合结束再解析。
 * Steer（jump）仍把原文交给当前回合。
 */
export function shouldQueueComposerSlash(mode: ComposerSubmitMode): boolean {
  return mode === 'queue'
}

/** 输入框 Shift+Tab：切换计划模式（对标 Codex Best practices：`/plan` 或 Shift+Tab） */
export function isPlanModeToggleKey(options: {
  key: string
  shiftKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  menuOpen?: boolean
}): boolean {
  if (options.menuOpen) return false
  if (options.key !== 'Tab') return false
  if (!options.shiftKey) return false
  if (options.ctrlKey || options.metaKey || options.altKey) return false
  return true
}

/** 刚提交、对话里可能还没有的草稿（取消运行 / 取消 worktree 创建后 ↑ 恢复） */
let rememberedSubmittedPrompt = ''

/** 发送时记住原文；空输入 ↑ 优先于对话历史（对标 Codex Troubleshooting） */
export function rememberSubmittedComposerPrompt(text: string): void {
  const value = String(text ?? '')
  if (value.trim()) rememberedSubmittedPrompt = value
}

export function rememberedSubmittedComposerPrompt(): string {
  return rememberedSubmittedPrompt
}

/** 测试用：避免跨用例泄漏 */
export function resetRememberedSubmittedComposerPrompt(): void {
  rememberedSubmittedPrompt = ''
}

/** 输入框为空时 ↑ 恢复刚提交或上一条用户提示（对标 Codex Restore previous composer prompt） */
export function restorePreviousComposerPrompt(options: {
  input: string
  messages: Array<{ role: string; content: string }>
  lastSubmitted?: string | null
}): string | null {
  if (options.input.length > 0) return null
  const submitted = options.lastSubmitted !== undefined ? options.lastSubmitted : rememberedSubmittedPrompt
  if (String(submitted ?? '').trim()) return String(submitted)
  return lastUserPrompt(options.messages)
}

/** 最近一条非空用户提示（↑ 恢复 / Ctrl+R） */
export function lastUserPrompt(messages: Array<{ role: string; content: string }>): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const row = messages[i]
    if (row.role !== 'user') continue
    const text = String(row.content || '')
    if (text.trim()) return text
  }
  return null
}

/** 最近一条非空用户消息 id（Esc+Esc 就地回编并分叉） */
export function lastUserMessageId(
  messages: Array<{ id?: string; role: string; content: string }>
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const row = messages[i]
    if (row.role !== 'user' || !String(row.content || '').trim()) continue
    const id = String(row.id || '').trim()
    if (id) return id
  }
  return null
}

/**
 * 空输入框连按 Esc：回编上一条用户气泡并分叉（对标 Codex Esc+Esc）。
 * 忙时 / 菜单开着 / 输入框有字都不触发；↑ 才负责恢复草稿。
 */
export function shouldEditLastUserOnEscape(options: {
  input: string
  loading: boolean
  menuOpen?: boolean
  prevEscAt: number
  now: number
}): boolean {
  if (options.loading || options.menuOpen) return false
  if (options.input.length > 0) return false
  return isDoubleEscape(options.prevEscAt, options.now)
}

/** 倒序去重的用户提示，供 Ctrl+R 反查 */
export function collectUserPrompts(
  messages: Array<{ role: string; content: string }>,
  limit = 40
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (let i = messages.length - 1; i >= 0; i--) {
    const row = messages[i]
    if (row.role !== 'user') continue
    const text = String(row.content || '').trim()
    if (!text || seen.has(text)) continue
    seen.add(text)
    out.push(text)
    if (out.length >= limit) break
  }
  return out
}

export function filterPromptHistory(prompts: string[], query: string): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return prompts
  return prompts.filter((p) => p.toLowerCase().includes(q))
}

/** 两次 Esc 间隔内视为回编上一条（对标 Codex Esc+Esc） */
export function isDoubleEscape(prevAt: number, now: number, windowMs = 450): boolean {
  return prevAt > 0 && now - prevAt <= windowMs
}
