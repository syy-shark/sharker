/**
 * Sharker IPC ↔ Maka UI：会话摘要、历史消息、StreamChunk → LiveTurn 事件。
 * @see src/ARCH.md
 */
import type { PermissionMode as MakaPermissionMode } from '@maka/core/permission'
import type { SessionEvent } from '@maka/core/events'
import type { SessionSummary, StoredMessage } from '@maka/core/session'
import {
  applyLiveTurnEvent,
  armLiveTurn,
  type LiveTurnProjection
} from '@maka/ui'
import type { ConversationSummary } from '../../shared/conversation'
import type { ChatMessage, PermissionMode, StreamChunk } from '../../shared/types'

/** Sharker 权限 → Maka composer 权限 */
export function toMakaPermission(mode: PermissionMode | undefined): MakaPermissionMode {
  return mode === 'full' ? 'bypass' : 'ask'
}

/** Maka composer 权限 → Sharker 权限 */
export function fromMakaPermission(mode: MakaPermissionMode): PermissionMode {
  return mode === 'bypass' ? 'full' : 'sandbox'
}

/** 侧栏对话 → Maka SessionSummary */
export function toSessionSummary(
  conv: ConversationSummary,
  input: {
    model: string
    providerId: string
    permissionMode: PermissionMode
    running?: boolean
  }
): SessionSummary {
  return {
    id: conv.id,
    name: conv.title,
    isFlagged: conv.pinned === true,
    isArchived: conv.status === 'archived',
    labels: conv.gitBranch ? [conv.gitBranch] : [],
    hasUnread: conv.unread === true,
    lastMessageAt: conv.updatedAt,
    lastMessagePreview: conv.preview,
    status: input.running ? 'running' : 'active',
    runningTurnIds: input.running ? [`turn:${conv.id}`] : [],
    backend: 'ai-sdk',
    llmConnectionId: input.providerId || undefined,
    llmConnectionSlug: input.providerId || 'default',
    connectionLocked: true,
    model: input.model || 'default',
    permissionMode: toMakaPermission(input.permissionMode)
  }
}

/** 历史气泡 → Maka StoredMessage */
export function toStoredMessages(messages: readonly ChatMessage[]): StoredMessage[] {
  const out: StoredMessage[] = []
  let turnId = ''
  for (const msg of messages) {
    const ts = msg.createdAt ?? 0
    if (msg.role === 'user') {
      turnId = msg.id
      out.push({
        type: 'user',
        id: msg.id,
        turnId,
        ts,
        text: msg.content
      })
      continue
    }
    if (msg.role === 'assistant') {
      if (!turnId) turnId = msg.id
      out.push({
        type: 'assistant',
        id: msg.id,
        turnId,
        ts,
        text: msg.content,
        modelId: msg.meta?.model ?? 'default'
      })
    }
  }
  return out
}

function eventId(chunk: StreamChunk, suffix: string): string {
  return `${chunk.conversationId ?? 'x'}:${chunk.timestamp ?? Date.now()}:${suffix}`
}

/** StreamChunk → Maka SessionEvent；对不上的块返回 null */
export function streamChunkToSessionEvent(
  chunk: StreamChunk,
  turnId: string,
  stepId: string
): SessionEvent | null {
  const ts = chunk.timestamp ?? Date.now()
  const id = eventId(chunk, chunk.type)
  if (chunk.type === 'token' && chunk.content) {
    return { type: 'text_delta', id, turnId, ts, messageId: stepId, text: chunk.content }
  }
  if (chunk.type === 'think' && chunk.content) {
    return { type: 'thinking_delta', id, turnId, ts, messageId: stepId, text: chunk.content }
  }
  if (chunk.type === 'tool_start' && chunk.toolCallId && chunk.toolName) {
    return {
      type: 'tool_start',
      id,
      turnId,
      ts,
      toolUseId: chunk.toolCallId,
      toolName: chunk.toolName,
      args: chunk.toolArgs ?? {},
      stepId
    }
  }
  if (chunk.type === 'tool_preview' && chunk.toolCallId) {
    const text =
      typeof chunk.content === 'string' && chunk.content
        ? chunk.content
        : JSON.stringify(chunk.toolArgs ?? {})
    return {
      type: 'tool_progress',
      id,
      turnId,
      ts,
      toolUseId: chunk.toolCallId,
      chunk: text
    }
  }
  if (chunk.type === 'tool_done' && chunk.toolCallId) {
    return {
      type: 'tool_result',
      id,
      turnId,
      ts,
      toolUseId: chunk.toolCallId,
      isError: chunk.toolStatus === 'error',
      content: {
        kind: 'text',
        text: chunk.resultSummary || chunk.resultOutput || chunk.error || ''
      }
    }
  }
  if (chunk.type === 'done') {
    return { type: 'complete', id, turnId, ts, stopReason: 'end_turn' }
  }
  if (chunk.type === 'turn_cancelled') {
    return { type: 'abort', id, turnId, ts, reason: 'user_stop' }
  }
  if (chunk.type === 'error') {
    return {
      type: 'error',
      id,
      turnId,
      ts,
      recoverable: false,
      message: chunk.error || chunk.content || 'error'
    }
  }
  return null
}

/** 把一块 StreamChunk 折进 LiveTurnProjection */
export function applySharkerChunk(
  current: LiveTurnProjection | undefined,
  chunk: StreamChunk,
  turnId: string,
  stepId: string
): LiveTurnProjection | undefined {
  if (chunk.type === 'turn_start') {
    return armLiveTurn(turnId)
  }
  const event = streamChunkToSessionEvent(chunk, turnId, stepId)
  if (!event) return current
  return applyLiveTurnEvent(current, event, 'zh')
}
