/**
 * 直播助手行：过程与回答分开订 store 切片。
 * token 只重绘回答尾；正文加长不扫过程指纹、不重跑过程 / 回答 buildAnswerParts，过程对象能复用就不抬 TurnFlow（对标 Codex #22860）。
 * @see src/components/ARCH.md
 */
import { memo } from 'react'
import type { ApprovalRequest, AssistantMeta, UserInputRequest, UserInputResponse } from '../../shared/types'
import type { ApprovalDecision } from '../../shared/approval-session'
import { shouldMountMessageActions } from '../../shared/live-display'
import {
  nextFilesChangedStats,
  type FilesChangedStatsView
} from '../../shared/files-changed-card'
import { FilesChangedCard } from './FilesChangedCard'
import {
  liveAnswerViewFromSnap,
  nextLiveAnswerActions,
  nextLiveProcessView,
  type LiveAnswerView
} from '../../shared/live-stream-slices'
import { getLiveStreamUi, useLiveStreamUiSelect } from '../hooks/useLiveStreamUi'
import { InlineApproval } from './InlineApproval'
import { InlineUserInput } from './InlineUserInput'
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

/** 已改文件卡：只订片段 +/-，token 数字没变不重绘 */
const LiveFilesChangedCard = memo(function LiveFilesChangedCard({
  files,
  onOpenReview
}: {
  files: readonly string[]
  onOpenReview?: (paths: string[]) => void
}) {
  const stats = useLiveStreamUiSelect((snap, prev: FilesChangedStatsView | undefined) =>
    nextFilesChangedStats(prev ?? null, snap.liveSegments)
  )
  return (
    <FilesChangedCard
      files={files}
      live
      added={stats.added}
      removed={stats.removed}
      fileStats={stats.byPath}
      onOpenReview={onOpenReview}
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
  userInput,
  userInputResponding,
  onUserInput,
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
  userInput?: UserInputRequest | null
  userInputResponding?: boolean
  onUserInput?: (response: UserInputResponse) => void | Promise<void>
  onOpenSubAgent?: (id: string | null) => void
  onOpenChangedFiles?: (paths: string[]) => void
  toolOutputDisplay?: 'brief' | 'standard' | 'verbose'
  onNeedFullMessage?: (messageId: string) => void
}) {
  const changedFiles = meta?.changedFiles ?? []
  return (
    <article className="assistant-message">
      <LiveStoreProcess
        liveStartedAt={liveStartedAt}
        approvalWaiting={Boolean(approval) || Boolean(userInput)}
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
      {userInput && onUserInput ? (
        <InlineUserInput
          request={userInput}
          responding={userInputResponding}
          onRespond={onUserInput}
        />
      ) : null}
      {changedFiles.length > 0 ? (
        <LiveFilesChangedCard files={changedFiles} onOpenReview={onOpenChangedFiles} />
      ) : null}
      <LiveStoreActions messageId={messageId} />
    </article>
  )
})
