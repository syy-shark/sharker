/**
 * 直播助手行：过程与回答分开订 store 切片。
 * token 只重绘回答尾；正文或思考加长不扫过程 / 已改文件指纹、不重跑过程 / 回答 buildAnswerParts；思考旁白另订 store，时间线引用能复用就不抬 TurnFlow；闭合与尾同一列表，封口按 part.id 留下 StreamingMarkdown（对标 Codex #22860）。
 * 写盘 +/- 在 closed 里仍 `live`：同一帧 write+token 后正文成尾，diff 不折 20 行、内层继续跟尾。
 * 收束关 loading 后同一实例留下：过程 `isStreaming` 停秒表，Thought 仍留在直播行（不整块卸掉），回答 diff 仍 live 以免折 20 行跳；跟进 adopt 后 `frozen` 停订 store，按 adopt 前 part 引用与旁白原文留下树（对标 Codex preserved streamed activity）。
 * 直播 `StreamingMarkdown` 标 `live`，闭合围栏不跑 Prism；`streaming` 跟 loading，收束后再画 mermaid。
 * @see src/components/ARCH.md
 */
import { memo, useRef } from 'react'
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
  nextLiveAnswerRenderParts,
  nextLiveProcessTimeline,
  type LiveAnswerView,
  type LiveProcessTimeline
} from '../../shared/live-stream-core'
import { getLiveStreamUi, useLiveStreamUiSelectWhen } from '../hooks/useLiveStreamUi'
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
  onNeedFullMessage,
  isStreaming,
  frozen = false
}: {
  liveStartedAt?: number
  approvalWaiting: boolean
  onOpenSubAgent?: (id: string | null) => void
  toolOutputDisplay?: 'brief' | 'standard' | 'verbose'
  messageId: string
  onNeedFullMessage?: (messageId: string) => void
  isStreaming: boolean
  frozen?: boolean
}) {
  const held = useRef<LiveProcessTimeline | null>(null)
  const storeView = useLiveStreamUiSelectWhen(
    !frozen,
    (snap, prev: LiveProcessTimeline | undefined) => nextLiveProcessTimeline(prev ?? null, snap)
  )
  if (!frozen) held.current = storeView
  const view = (frozen ? held.current : storeView) ?? storeView
  return (
    <div className="assistant-process-below assistant-process-below--live-top">
      <div className="turn-flow-live-panel">
        <TurnFlow
          segments={view.processForFlow}
          isStreaming={isStreaming}
          liveStartedAt={liveStartedAt}
          approvalWaiting={approvalWaiting}
          liveThought
          hasThought={view.hasThought}
          contentStreaming={view.contentStreaming}
          generatingDemo={view.generatingDemo}
          answerStreaming={view.answerStreaming}
          onOpenSubAgent={onOpenSubAgent}
          toolOutputDisplay={toolOutputDisplay}
          messageId={messageId}
          onNeedFullMessage={onNeedFullMessage}
          frozen={frozen}
        />
      </div>
    </div>
  )
})

function renderLiveAnswerPart(
  part: LiveAnswerView['parts'][number],
  options: { liveDiff: boolean; markdownStreaming: boolean }
) {
  if (part.type === 'demo') {
    return (
      <InlineDemo
        key={part.id}
        html={part.html}
        caption={part.caption}
        live
        streaming={Boolean(options.markdownStreaming && part.streaming)}
      />
    )
  }
  if (part.type === 'diff') {
    return <LiveFileDiff key={part.id} diff={part.diff} streaming={options.liveDiff} />
  }
  return (
    <StreamingMarkdown
      key={part.id}
      text={part.content}
      live
      streaming={options.markdownStreaming}
    />
  )
}

/** 闭合与尾同一列表：封口时同一 part 引用留下，不拆 StreamingMarkdown / InlineDemo（对标 Codex #22860）。 */
const LiveStoreAnswer = memo(function LiveStoreAnswer({
  markdownStreaming,
  frozen = false,
  frozenParts
}: {
  markdownStreaming: boolean
  frozen?: boolean
  frozenParts?: readonly LiveAnswerView['parts'][number][] | null
}) {
  const held = useRef<readonly LiveAnswerView['parts'][number][] | null>(null)
  const storeParts = useLiveStreamUiSelectWhen(
    !frozen,
    (snap, prev: LiveAnswerView['parts'] | undefined) =>
      nextLiveAnswerRenderParts(prev ?? null, snap)
  )
  if (!frozen) held.current = storeParts
  const parts = frozenParts ?? held.current ?? storeParts
  if (!parts.length) return null
  return (
    <div className="assistant-message-body message-body--assistant turn-flow-final turn-flow-final--streaming message-body--streaming-active">
      {parts.map((part) =>
        renderLiveAnswerPart(part, { liveDiff: true, markdownStreaming })
      )}
    </div>
  )
})

/** 操作条：只订布尔；复制点按时再读最新正文 */
const LiveStoreActions = memo(function LiveStoreActions({
  messageId,
  createdAt,
  frozen = false,
  frozenCopyable
}: {
  messageId: string
  createdAt?: number
  frozen?: boolean
  frozenCopyable?: string
}) {
  const held = useRef<string>('')
  const chrome = useLiveStreamUiSelectWhen(!frozen, (snap, prev) =>
    nextLiveAnswerActions(prev ?? null, snap)
  )
  if (!frozen) held.current = liveAnswerViewFromSnap(getLiveStreamUi()).copyable
  const showActions = shouldMountMessageActions({ showBody: chrome.show || frozen })
  if (!showActions) return null
  return (
    <MessageActions
      content=""
      getContent={() => (frozen ? frozenCopyable ?? held.current : liveAnswerViewFromSnap(getLiveStreamUi()).copyable)}
      messageId={messageId}
      createdAt={chrome.reserved && !frozen ? undefined : createdAt}
      reserved={frozen ? false : chrome.reserved}
    />
  )
})

/** 已改文件卡：只订片段 +/-，token 数字没变不重绘 */
const LiveFilesChangedCard = memo(function LiveFilesChangedCard({
  files,
  onOpenReview,
  frozen = false
}: {
  files: readonly string[]
  onOpenReview?: (paths: string[]) => void
  frozen?: boolean
}) {
  const held = useRef<FilesChangedStatsView | null>(null)
  const storeStats = useLiveStreamUiSelectWhen(
    !frozen,
    (snap, prev: FilesChangedStatsView | undefined) =>
      nextFilesChangedStats(prev ?? null, snap.liveSegments)
  )
  if (!frozen) held.current = storeStats
  const stats = (frozen ? held.current : storeStats) ?? storeStats
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
  onNeedFullMessage,
  isStreaming = true,
  frozen = false,
  frozenParts = null,
  frozenCopyable
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
  isStreaming?: boolean
  frozen?: boolean
  frozenParts?: readonly LiveAnswerView['parts'][number][] | null
  frozenCopyable?: string
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
        isStreaming={isStreaming}
        frozen={frozen}
      />
      <LiveStoreAnswer
        markdownStreaming={isStreaming}
        frozen={frozen}
        frozenParts={frozenParts}
      />
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
        <LiveFilesChangedCard
          files={changedFiles}
          onOpenReview={onOpenChangedFiles}
          frozen={frozen}
        />
      ) : null}
      <LiveStoreActions
        messageId={messageId}
        createdAt={liveStartedAt && liveStartedAt > 0 ? liveStartedAt : undefined}
        frozen={frozen}
        frozenCopyable={frozenCopyable}
      />
    </article>
  )
})
