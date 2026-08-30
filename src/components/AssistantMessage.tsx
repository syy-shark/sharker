/**
 * AI 助手消息：有序过程流（思考/旁白/工具）+ 最终回答
 * @see src/ARCH.md
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ChevronDown, CircleStop, RotateCcw } from 'lucide-react'
import { MarkdownBody } from './MarkdownBody'
import type { ApprovalRequest, AssistantMeta, FileDiff, TurnSegment, UserInputRequest, UserInputResponse } from '../../shared/types'
import type { ApprovalDecision } from '../../shared/approval-session'
import { buildProcessSteps, canExpandProcess } from '../../shared/process-steps'
import {
  buildAnswerParts,
  extractFinalContent,
  hasProcessFlow,
  processSegments,
  reuseAnswerParts,
  shouldDisplayFinalBody
} from '../../shared/turn-segments'
import { deriveProcessPhases, summarizeProcessPhases } from '../../shared/process-phases'
import {
  liveThinkingText,
  isInlineDemoPaintable,
  formatThoughtLabel,
  resolveStoppedAfterLabel,
  WORKED_FOR_LABEL,
  sameRefList,
  shouldMountMessageActions,
  shouldReserveMessageActions,
  stripStoppedAfterFootnote,
  turnProcessBounds
} from '../../shared/live-display'
import { shouldPreserveLiveDiffExpanded } from '../../shared/session-runtime'
import { MessageActions } from './MessageActions'
import { nextFilesChangedStats } from '../../shared/files-changed-card'
import { FilesChangedCard } from './FilesChangedCard'
import { ProcessTimeline } from './ProcessTimeline'
import { ThoughtDisclosure, TurnFlow } from './TurnFlow'
import { messageHasDeferredThinking } from '../../shared/transcript-hydrate'
import { InlineDemo } from './InlineDemo'
import { InlineApproval } from './InlineApproval'
import { InlineUserInput } from './InlineUserInput'
import { StreamingMarkdown } from './StreamingMarkdown'
import { CodeDiffBlock } from './CodeDiffBlock'
import { exploreNameFromPath } from '../../shared/explore-activity'
import { dispatchOpenWorkspaceFile } from '../lib/open-workspace-file'
import './AssistantMessage.css'
import './TurnFlow.css'

/** AssistantMessage Props */
interface Props {
  messageId: string
  content: string
  createdAt?: number
  meta?: AssistantMeta
  modelLabel?: string
  /** 直播中的有序片段（仅流式 turn） */
  liveSegments?: TurnSegment[]
  hadThinkingLive?: boolean
  isThinkingLive?: boolean
  activeTool?: string | null
  liveStartedAt?: number
  isStreaming?: boolean
  onRetry?: () => void
  /** 从此条分叉；直播行不传（对标 Codex 拒绝 in-progress lastTurnId） */
  onFork?: () => void
  approval?: ApprovalRequest | null
  approvalResponding?: boolean
  onApproval?: (decision: ApprovalDecision) => void | Promise<void>
  userInput?: UserInputRequest | null
  userInputResponding?: boolean
  onUserInput?: (response: UserInputResponse) => void | Promise<void>
  /** 主线程活动点开子 Agent */
  onOpenSubAgent?: (id: string | null) => void
  /** 完成后「已改 N 个文件」打开审查（对标 Codex 变更摘要） */
  onOpenChangedFiles?: (paths: string[]) => void
  /** 对话里命令输出展示量 */
  toolOutputDisplay?: 'brief' | 'standard' | 'verbose'
  /** 点开瘦身后的命令输出 / 思考时取完整消息 */
  onNeedFullMessage?: (messageId: string) => void
  /** 刚离开直播槽时历史重挂仍展开 diff，但不跟尾 */
  preserveLiveDiffs?: boolean
  children?: React.ReactNode
}

/** 直播文件 diff：写入一开始占槽，参数流填 +/-；直播中不折行、内层跟尾 */
export const LiveFileDiff = memo(function LiveFileDiff({
  diff,
  streaming = false,
  preserveLiveDiffs = false
}: {
  diff: FileDiff
  streaming?: boolean
  preserveLiveDiffs?: boolean
}) {
  return (
    <div className="assistant-live-diff">
      <CodeDiffBlock
        diff={diff}
        live={streaming}
        showHeader
        wrapLines={!streaming}
        maxPreviewLines={20}
        defaultExpanded={shouldPreserveLiveDiffExpanded({ streaming, preserveLiveDiffs })}
        onOpenLine={(line) => dispatchOpenWorkspaceFile({ path: diff.path, line })}
      />
    </div>
  )
})

/** 秒数 → 显示用耗时文案 */
function formatDuration(sec: number): string {
  if (sec < 1) return '<1s'
  return `${sec}s`
}

/** 单条助手消息：过程流 + 最终回答。历史消息 memo，避免直播 token 拖着整列重绘。 */
export const AssistantMessage = memo(function AssistantMessage({
  messageId,
  content,
  createdAt,
  meta,
  modelLabel,
  liveSegments,
  hadThinkingLive = false,
  isThinkingLive = false,
  activeTool = null,
  liveStartedAt,
  isStreaming,
  onRetry,
  onFork,
  approval,
  approvalResponding,
  onApproval,
  userInput,
  userInputResponding,
  onUserInput,
  onOpenSubAgent,
  onOpenChangedFiles,
  toolOutputDisplay = 'standard',
  onNeedFullMessage,
  preserveLiveDiffs = false,
  children
}: Props) {
  const [flowOpen, setFlowOpen] = useState(false)
  const [filesOpen, setFilesOpen] = useState(false)
  const [thoughtOpen, setThoughtOpen] = useState(false)
  const userToggledFlow = useRef(false)

  const segments = liveSegments ?? meta?.segments
  const useSegmentFlow = Boolean(segments && segments.length > 0)

  const browsedFiles = meta?.browsedFiles ?? []
  const browsedLeaf = exploreNameFromPath(browsedFiles[0])
  const changedFiles = meta?.changedFiles ?? []
  const changedStats = useMemo(() => nextFilesChangedStats(null, segments), [segments])
  const hadThinking = meta?.hadThinking ?? hadThinkingLive
  // Keep the UI at a high-level status; raw provider reasoning remains internal.
  const thinkingText = hadThinking
    ? isThinkingLive
      ? '正在分析任务目标与约束'
      : '已完成任务分析'
    : ''

  const shownDuration =
    meta?.durationSec ??
    (!isStreaming && liveStartedAt != null
      ? Math.max(0, Math.round((Date.now() - liveStartedAt) / 1000))
      : undefined)

  // —— 旧消息回退：无 segments 时用 ProcessTimeline ——
  const processSteps = useMemo(
    () =>
      buildProcessSteps({
        activities: meta?.activities ?? [],
        hadThinking,
        thinkingText,
        isStreaming,
        isThinkingLive,
        activeTool
      }),
    [meta?.activities, hadThinking, thinkingText, isStreaming, isThinkingLive, activeTool]
  )
  const legacyExpandable = !useSegmentFlow && canExpandProcess(processSteps)

  useEffect(() => {
    if (!isStreaming) {
      setFlowOpen(false)
      userToggledFlow.current = false
      return
    }
    if (!useSegmentFlow) {
      return
    }
    if (!userToggledFlow.current) setFlowOpen(true)
  }, [isStreaming, useSegmentFlow, segments?.length])

  const extractedFinal = useMemo(
    () => (useSegmentFlow ? extractFinalContent(segments!, { isStreaming }) : ''),
    [isStreaming, segments, useSegmentFlow]
  )
  // 错误/中止时 segment 可能只有 tool/status 而无 final 文本：回退到 message.content
  const finalContentRaw = (
    extractedFinal.trim() ||
    content.trim()
  )
  const isError =
    meta?.outcome === 'error' || /^\*\*错误\*\*:?/u.test(finalContentRaw)
  const isAborted = meta?.outcome === 'aborted'
  const finalDecision =
    useSegmentFlow && !isError && !isAborted
      ? shouldDisplayFinalBody(finalContentRaw, segments!, { isStreaming })
      : { show: Boolean(finalContentRaw.trim()), content: finalContentRaw }
  const finalContent = finalDecision.show ? finalDecision.content : ''
  const displayContent = isAborted ? stripStoppedAfterFootnote(finalContentRaw) : finalContent
  const abortedBounds = isAborted ? turnProcessBounds(segments ?? []) : undefined
  const stoppedAfterLabel = isAborted
    ? resolveStoppedAfterLabel({
        content: finalContentRaw,
        startedAt: abortedBounds?.startedAt,
        endedAt: abortedBounds?.endedAt
      })
    : ''

  // 文字 + 内联演示按时间顺序交错（可在 demo 上/下）
  const answerPartsRef = useRef<ReturnType<typeof buildAnswerParts>>([])
  const answerParts = useMemo(() => {
    if (!useSegmentFlow || !segments?.length || isError || isAborted) {
      answerPartsRef.current = []
      return []
    }
    const next = reuseAnswerParts(answerPartsRef.current, buildAnswerParts(segments, { isStreaming }))
    answerPartsRef.current = next
    return next
  }, [useSegmentFlow, segments, isStreaming, isError, isAborted])

  const processOnly = useMemo(
    () => (useSegmentFlow ? processSegments(segments!, { isStreaming }) : []),
    [isStreaming, segments, useSegmentFlow]
  )
  // 过程区不再重复：主区已展示的文字 / 内联演示
  const answerTextIds = useMemo(
    () => new Set(answerParts.filter((p) => p.type === 'text').map((p) => p.id)),
    [answerParts]
  )
  const processForFlowRef = useRef<TurnSegment[]>([])
  const processForFlow = useMemo(() => {
    const next = processOnly.filter((s) => {
      if (s.toolName === 'present_inline_demo') return false
      if (s.kind === 'text' && answerTextIds.has(s.id)) return false
      return true
    })
    if (sameRefList(processForFlowRef.current, next)) return processForFlowRef.current
    processForFlowRef.current = next
    return next
  }, [processOnly, answerTextIds])
  const showFlowPanel = useSegmentFlow && (isStreaming ? true : flowOpen)
  /** 完成后可展开：真实工具 / 未进正文的旁白 / 错误。演示与闲聊不占按钮。 */
  const hasExpandableProcess = processForFlow.some(
    (s) =>
      (s.kind === 'tool' && s.toolName !== 'present_inline_demo') ||
      s.kind === 'text' ||
      s.status === 'error'
  )
  const hasAnswerStream = answerParts.length > 0
  const hasLiveProse = answerParts.some((p) => p.type === 'text' && p.content.trim())
  const hasLiveDiffs = answerParts.some((p) => p.type === 'diff')
  const hasLiveDemo = answerParts.some((p) => p.type === 'demo')
  const hasPaintableDemo = answerParts.some(
    (p) => p.type === 'demo' && isInlineDemoPaintable(p.html)
  )
  const generatingDemo = Boolean(isStreaming && hasLiveDemo && !hasPaintableDemo)
  const liveThinkText = useSegmentFlow ? liveThinkingText(segments!) : ''
  const deferredThinking = messageHasDeferredThinking({
    id: messageId,
    role: 'assistant',
    content,
    meta
  })
  const requestFullMessage = () => {
    onNeedFullMessage?.(messageId)
  }
  const showFinalBody =
    Boolean(children) ||
    (isStreaming ? hasLiveProse || hasLiveDemo || hasLiveDiffs : hasAnswerStream) ||
    (Boolean(displayContent) &&
      (isError || isAborted || finalDecision.show) &&
      !useSegmentFlow)
  const showCompletedProcess =
    !isStreaming && (hasExpandableProcess || (!useSegmentFlow && legacyExpandable))
  const phaseModel = useMemo(
    () => (useSegmentFlow ? deriveProcessPhases(segments!, { isStreaming }) : null),
    [isStreaming, segments, useSegmentFlow]
  )
  const summary = phaseModel
    ? summarizeProcessPhases(
        phaseModel,
        meta?.durationSec ?? shownDuration,
        meta?.outcome === 'error' || meta?.outcome === 'aborted'
          ? meta.outcome
          : /^\*\*错误\*\*:?/u.test((content || '').trim())
            ? 'error'
            : 'success'
      )
    : null
  const showMetaRow =
    shownDuration != null ||
    browsedFiles.length > 0 ||
    isStreaming ||
    (useSegmentFlow && hasProcessFlow(segments!, { isStreaming })) ||
    legacyExpandable
  const copyableContent = (
    displayContent ||
    answerParts
      .filter((p): p is Extract<(typeof answerParts)[number], { type: 'text' }> => p.type === 'text')
      .map((p) => p.content)
      .join('\n\n')
  ).trim()
  const showActions = shouldMountMessageActions({ showBody: showFinalBody, isError })
  const reserveActions = shouldReserveMessageActions({
    isStreaming,
    hasCopyableContent: Boolean(copyableContent)
  })

  const legacyProcessLabel = isStreaming
    ? activeTool
      ? 'Working'
      : formatThoughtLabel(true)
    : hadThinking
      ? formatThoughtLabel(false)
      : WORKED_FOR_LABEL

  return (
    <article className="assistant-message">
      {/* 直播过程统一走 TurnFlow 呼吸头 */}

      {showMetaRow && !useSegmentFlow && !isStreaming && (
        <div className="assistant-message-meta">
          {(shownDuration != null || isStreaming || legacyExpandable) && (
            <>
              {legacyExpandable ? (
                <button
                  type="button"
                  className={`assistant-meta-chip ${isStreaming ? 'assistant-meta-chip--live' : ''}`}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setFlowOpen((o) => !o)
                  }}
                  aria-expanded={flowOpen}
                >
                  <span>{legacyProcessLabel}</span>
                  <span className="assistant-meta-chip-value">
                    {shownDuration != null ? formatDuration(shownDuration) : '…'}
                  </span>
                  <ChevronDown
                    size={12}
                    className={`assistant-meta-chevron ${flowOpen ? 'assistant-meta-chevron--open' : ''}`}
                    aria-hidden
                  />
                </button>
              ) : (
                <span className="assistant-meta-chip assistant-meta-chip--static" title={modelLabel}>
                  <span>{legacyProcessLabel}</span>
                  <span className="assistant-meta-chip-value">
                    {shownDuration != null ? formatDuration(shownDuration) : '…'}
                  </span>
                </span>
              )}
            </>
          )}
          {browsedFiles.length > 0 && (
            <button
              type="button"
              className="assistant-meta-chip"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setFilesOpen((o) => !o)
              }}
              aria-expanded={filesOpen}
            >
              <span>Read</span>
              {browsedLeaf ? <span className="assistant-meta-chip-value">{browsedLeaf}</span> : null}
              <ChevronDown
                size={12}
                className={`assistant-meta-chevron ${filesOpen ? 'assistant-meta-chevron--open' : ''}`}
                aria-hidden
              />
            </button>
          )}
        </div>
      )}


      {/* 直播：思考/工具在上、正文在下（对标 Codex 时序）；间距固定，正文出现后收起命令输出以免顶回答 */}
      {isStreaming ? (
        <div className="assistant-process-below assistant-process-below--live-top">
          {useSegmentFlow ? (
            <div className="turn-flow-live-panel">
              <TurnFlow
                segments={processForFlow}
                isStreaming
                liveStartedAt={liveStartedAt}
                approvalWaiting={Boolean(approval) || Boolean(userInput)}
                thinkText={liveThinkText}
                contentStreaming={hasLiveProse || hasPaintableDemo}
                generatingDemo={generatingDemo}
                answerStreaming={Boolean(finalContentRaw.trim() || hasLiveProse)}
                onOpenSubAgent={onOpenSubAgent}
                toolOutputDisplay={toolOutputDisplay}
                messageId={messageId}
                onNeedFullMessage={onNeedFullMessage}
              />
            </div>
          ) : (
            <div className="turn-flow-live-panel">
              <TurnFlow
                segments={[]}
                isStreaming
                liveStartedAt={liveStartedAt}
                approvalWaiting={Boolean(approval) || Boolean(userInput)}
                thinkText={liveThinkText}
                contentStreaming={Boolean(finalContentRaw.trim())}
                generatingDemo={false}
                answerStreaming={Boolean(finalContentRaw.trim())}
                onOpenSubAgent={onOpenSubAgent}
                toolOutputDisplay={toolOutputDisplay}
                messageId={messageId}
                onNeedFullMessage={onNeedFullMessage}
              />
            </div>
          )}
        </div>
      ) : liveThinkText.trim() || deferredThinking ? (
        <ThoughtDisclosure
          text={liveThinkText}
          open={thoughtOpen}
          onToggle={() => {
            const next = !thoughtOpen
            setThoughtOpen(next)
            if (next && deferredThinking) requestFullMessage()
          }}
          label={formatThoughtLabel(false)}
          elapsed={shownDuration != null ? formatDuration(shownDuration) : undefined}
          deferred={deferredThinking}
          loading={deferredThinking && thoughtOpen}
        />
      ) : null}

      {/* 结束后过程仍留在回答上方，避免直播收束时整块对调把贴底拽走 */}
      {showCompletedProcess ? (
        <div className="assistant-process-below assistant-process-below--live-top">
          {useSegmentFlow && hasExpandableProcess && summary ? (
            <button
              type="button"
              className={`turn-flow-summary-chip turn-flow-summary-chip--${
                isError ? 'error' : isAborted ? 'aborted' : 'success'
              }`}
              onClick={() => {
                userToggledFlow.current = true
                setFlowOpen((o) => !o)
              }}
              aria-expanded={flowOpen}
              aria-label={summary}
            >
              <span>{summary}</span>
              <ChevronDown
                size={11}
                className={`assistant-meta-chevron ${flowOpen ? 'assistant-meta-chevron--open' : ''}`}
                aria-hidden
              />
            </button>
          ) : null}

          {useSegmentFlow && hasExpandableProcess ? (
            <div
              className={`turn-flow-collapse ${showFlowPanel ? 'turn-flow-collapse--open' : ''}`}
              aria-hidden={!showFlowPanel}
              inert={showFlowPanel ? undefined : true}
            >
              <div className="turn-flow-collapse-inner">
                <TurnFlow
                  segments={processForFlow}
                  isStreaming={false}
                  onOpenSubAgent={onOpenSubAgent}
                  toolOutputDisplay={toolOutputDisplay}
                  messageId={messageId}
                  onNeedFullMessage={onNeedFullMessage}
                />
              </div>
            </div>
          ) : null}

          {legacyExpandable && !useSegmentFlow ? (
            <div
              className={`assistant-process-wrap ${flowOpen ? 'assistant-process-wrap--open' : ''}`}
              aria-hidden={!flowOpen}
              inert={flowOpen ? undefined : true}
            >
              <div className="assistant-process-inner">
                <div className="assistant-message-meta-panel" role="region" aria-label={WORKED_FOR_LABEL}>
                  <ProcessTimeline steps={processSteps} onOpenSubAgent={onOpenSubAgent} />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 正文 / 错误 / 中止 */}
      {isAborted ? (
        <div className="assistant-aborted" role="status">
          <CircleStop size={15} aria-hidden />
          <div>
            <strong>{stoppedAfterLabel}</strong>
          </div>
        </div>
      ) : null}

      {isError && finalContentRaw ? (
        <div className="assistant-error" role="alert">
          <div className="assistant-error-head">
            <AlertTriangle size={16} aria-hidden />
            <div>
              <strong>任务未完成</strong>
              <span>
                {finalContentRaw.replace(/\*\*错误\*\*:?\s*/g, '').split('\n')[0] ||
                  '请求执行失败'}
              </span>
            </div>
            {onRetry ? (
              <button type="button" className="assistant-error-retry" onClick={onRetry}>
                <RotateCcw size={14} aria-hidden />
                重试
              </button>
            ) : null}
          </div>
          <details className="assistant-error-details">
            <summary>
              查看详情 <ChevronDown size={13} aria-hidden />
            </summary>
            <MarkdownBody>{finalContentRaw}</MarkdownBody>
          </details>
        </div>
      ) : showFinalBody ? (
        <div
          className={`assistant-message-body message-body--assistant ${
            isStreaming
              ? 'turn-flow-final turn-flow-final--streaming message-body--streaming-active'
              : 'turn-flow-final'
          }`}
        >
          {children ??
            (hasAnswerStream ? (
              answerParts.map((part) => {
                if (part.type === 'demo') {
                  return (
                    <InlineDemo
                      key={part.id}
                      html={part.html}
                      caption={part.caption}
                      instanceId={part.id}
                      streaming={Boolean(isStreaming && part.streaming)}
                    />
                  )
                }
                if (part.type === 'diff') {
                  return (
                    <LiveFileDiff
                      key={part.id}
                      diff={part.diff}
                      streaming={Boolean(isStreaming)}
                      preserveLiveDiffs={preserveLiveDiffs}
                    />
                  )
                }
                return <StreamingMarkdown key={part.id} text={part.content} />
              })
            ) : displayContent ? (
              <StreamingMarkdown text={displayContent} />
            ) : null)}
        </div>
      ) : null}

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
        <FilesChangedCard
          files={changedFiles}
          live={Boolean(isStreaming)}
          added={changedStats.added}
          removed={changedStats.removed}
          fileStats={changedStats.byPath}
          onOpenReview={onOpenChangedFiles}
        />
      ) : null}

      {browsedFiles.length > 0 ? (
        <div
          className={`assistant-files-collapse ${filesOpen ? 'assistant-files-collapse--open' : ''}`}
          aria-hidden={!filesOpen}
          inert={filesOpen ? undefined : true}
        >
          <div className="assistant-files-collapse-inner">
            <ul className="assistant-message-files">
              {browsedFiles.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {showActions ? (
        <MessageActions
          content={copyableContent}
          messageId={messageId}
          createdAt={createdAt}
          reserved={reserveActions}
          onFork={reserveActions ? undefined : onFork}
        />
      ) : null}
    </article>
  )
})
