/**
 * 直播助手行：过程与回答分开订 store 切片。
 * token 只重绘回答；过程对象能复用就不抬 TurnFlow（对标 Codex #22860）。
 * @see src/components/ARCH.md
 */
import { memo } from 'react'
import type { ApprovalRequest, AssistantMeta } from '../../shared/types'
import type { ApprovalDecision } from '../../shared/approval-session'
import { formatChangedFilesLabel } from '../../shared/turn-notify'
import { shouldMountMessageActions } from '../../shared/live-display'
import {
  liveAnswerViewFromSnap,
  nextLiveAnswerActions,
  nextLiveProcessView,
  type LiveAnswerView
} from '../../shared/live-stream-slices'
import { getLiveStreamUi, useLiveStreamUiSelect } from '../hooks/useLiveStreamUi'
import { InlineApproval } from './InlineApproval'
import { InlineDemo } from './InlineDemo'
import { MessageActions } from './MessageActions'
import { StreamingMarkdown } from './StreamingMarkdown'
import { TurnFlow } from './TurnFlow'
import { LiveFileDiff } from './AssistantMessage'
import './AssistantMessage.css'
import './TurnFlow.css'

/** 直播过程：只在工具/思考切片变化时重绘 */
const LiveStoreProcess = memo(function LiveStoreProcess({
  liveStartedAt,
  approvalWaiting,
  onOpenSubAgent,
  toolOutputDisplay,
  messageId,
  onNeedFullMessage
}: {
  liveStartedAt?: number
  approvalWaiting: boolean
  onOpenSubAgent?: (id: string | null) => void
  toolOutputDisplay?: 'brief' | 'standard' | 'verbose'
  messageId: string
  onNeedFullMessage?: (messageId: string) => void
}) {
  const view = useLiveStreamUiSelect((snap, prev) => nextLiveProcessView(prev ?? null, snap))
  return (
    <div className="assistant-process-below assistant-process-below--live-top">
      <div className="turn-flow-live-panel">
        <TurnFlow
          segments={view.processForFlow}
          isStreaming
          liveStartedAt={liveStartedAt}
          approvalWaiting={approvalWaiting}
          thinkText={view.thinkText}
          contentStreaming={view.contentStreaming}
          generatingDemo={view.generatingDemo}
          answerStreaming={view.answerStreaming}
          onOpenSubAgent={onOpenSubAgent}
          toolOutputDisplay={toolOutputDisplay}
          messageId={messageId}
          onNeedFullMessage={onNeedFullMessage}
        />
      </div>
    </div>
  )
})

function renderLiveAnswerPart(part: LiveAnswerView['parts'][number], streaming: boolean) {
  if (part.type === 'demo') {
    return (
      <InlineDemo
        key={part.id}
        html={part.html}
        caption={part.caption}
        streaming={Boolean(streaming && part.streaming)}
      />
    )
  }
  if (part.type === 'diff') {
    return <LiveFileDiff key={part.id} diff={part.diff} streaming={streaming} />
  }
  return <StreamingMarkdown key={part.id} text={part.content} />
}

/** 已闭合回答：只在新块封口时重绘 */
const LiveStoreClosedAnswer = memo(function LiveStoreClosedAnswer() {
  const closed = useLiveStreamUiSelect((snap) => liveAnswerViewFromSnap(snap).closed)
  if (!closed.length) return null
  return <>{closed.map((part) => renderLiveAnswerPart(part, false))}</>
})

/** 增长中的尾块：跟 token */
const LiveStoreAnswerTail = memo(function LiveStoreAnswerTail() {
  const tail = useLiveStreamUiSelect((snap) => liveAnswerViewFromSnap(snap).tail)
  if (!tail) return null
  return <>{renderLiveAnswerPart(tail, true)}</>
})

/** 回答外壳：只订 show，token 不重绘已画块的父节点 */
const LiveStoreAnswer = memo(function LiveStoreAnswer() {
  const show = useLiveStreamUiSelect((snap) => liveAnswerViewFromSnap(snap).show)
  if (!show) return null
  return (
    <div className="assistant-message-body message-body--assistant turn-flow-final turn-flow-final--streaming message-body--streaming-active">
      <LiveStoreClosedAnswer />
      <LiveStoreAnswerTail />
    </div>
  )
})

/** 操作条：只订布尔；复制点按时再读最新正文 */
const LiveStoreActions = memo(function LiveStoreActions({ messageId }: { messageId: string }) {
  const chrome = useLiveStreamUiSelect((snap, prev) => nextLiveAnswerActions(prev ?? null, snap))
  const showActions = shouldMountMessageActions({ showBody: chrome.show })
  if (!showActions) return null
  return (
    <MessageActions
      content=""
      getContent={() => liveAnswerViewFromSnap(getLiveStreamUi()).copyable}
      messageId={messageId}
      reserved={chrome.reserved}
    />
  )
})

/** 直播助手正文：外壳不订 token */
export const LiveAssistantArticle = memo(function LiveAssistantArticle({
  messageId,
  meta,
  liveStartedAt,
  approval,
  approvalResponding,
  onApproval,
  onOpenSubAgent,
  onOpenChangedFiles,
  toolOutputDisplay,
  onNeedFullMessage
}: {
  messageId: string
  meta?: AssistantMeta
  liveStartedAt?: number
  approval?: ApprovalRequest | null
  approvalResponding?: boolean
  onApproval?: (decision: ApprovalDecision) => void | Promise<void>
  onOpenSubAgent?: (id: string | null) => void
  onOpenChangedFiles?: (paths: string[]) => void
  toolOutputDisplay?: 'brief' | 'standard' | 'verbose'
  onNeedFullMessage?: (messageId: string) => void
}) {
  const changedFiles = meta?.changedFiles ?? []
  const changedLabel = formatChangedFilesLabel(changedFiles.length)
  return (
    <article className="assistant-message">
      <LiveStoreProcess
        liveStartedAt={liveStartedAt}
        approvalWaiting={Boolean(approval)}
        onOpenSubAgent={onOpenSubAgent}
        toolOutputDisplay={toolOutputDisplay}
        messageId={messageId}
        onNeedFullMessage={onNeedFullMessage}
      />
      <LiveStoreAnswer />
      {approval && onApproval ? (
        <InlineApproval
          request={approval}
          responding={approvalResponding}
          onRespond={onApproval}
        />
      ) : null}
      {changedFiles.length > 0 ? (
        <div className="assistant-changed-row">
          {onOpenChangedFiles ? (
            <button
              type="button"
              className="assistant-meta-chip assistant-meta-chip--live"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onOpenChangedFiles(changedFiles)
              }}
            >
              <span>已改</span>
              <span className="assistant-meta-chip-value">{changedFiles.length} 个文件</span>
            </button>
          ) : (
            <span className="assistant-meta-chip assistant-meta-chip--static" title={changedLabel}>
              <span>已改</span>
              <span className="assistant-meta-chip-value">{changedFiles.length} 个文件</span>
            </span>
          )}
        </div>
      ) : null}
      <LiveStoreActions messageId={messageId} />
    </article>
  )
})
