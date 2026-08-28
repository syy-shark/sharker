/**
 * AI 助手消息：有序过程流（思考/旁白/工具）+ 最终回答
 * @see src/ARCH.md
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ChevronDown, CircleStop, RotateCcw } from 'lucide-react'
import { MarkdownBody } from './MarkdownBody'
import type { ApprovalRequest, AssistantMeta, TurnSegment } from '../../shared/types'
import type { ApprovalDecision } from '../../shared/approval-session'
import { buildProcessSteps, canExpandProcess } from '../../shared/process-steps'
import {
  buildAnswerParts,
  extractFinalContent,
  hasProcessFlow,
  processSegments,
  shouldDisplayFinalBody
} from '../../shared/turn-segments'
import { deriveProcessPhases, summarizeProcessPhases } from '../../shared/process-phases'
import { liveThinkingText, isInlineDemoPaintable } from '../../shared/live-display'
import { MessageActions } from './MessageActions'
import { ProcessTimeline } from './ProcessTimeline'
import { ThoughtDisclosure, TurnFlow } from './TurnFlow'
import { InlineDemo } from './InlineDemo'
import { InlineApproval } from './InlineApproval'
import { StreamingMarkdown } from './StreamingMarkdown'
import './AssistantMessage.css'
import './TurnFlow.css'

/** AssistantMessage Props */
interface Props {
  messageId: string
  content: string
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
  approval?: ApprovalRequest | null
  approvalResponding?: boolean
  onApproval?: (decision: ApprovalDecision) => void | Promise<void>
  children?: React.ReactNode
}

/** 秒数 → 显示用耗时文案 */
function formatDuration(sec: number): string {
  if (sec < 1) return '<1s'
  return `${sec}s`
}

/** 单条助手消息：过程流 + 最终回答 */
export function AssistantMessage({
  messageId,
  content,
  meta,
  modelLabel,
  liveSegments,
  hadThinkingLive = false,
  isThinkingLive = false,
  activeTool = null,
  liveStartedAt,
  isStreaming,
  onRetry,
  approval,
  approvalResponding,
  onApproval,
  children
}: Props) {
  const [flowOpen, setFlowOpen] = useState(false)
  const [filesOpen, setFilesOpen] = useState(false)
  const [liveSec, setLiveSec] = useState(0)
  const [thoughtOpen, setThoughtOpen] = useState(false)
  const userToggledFlow = useRef(false)

  const segments = liveSegments ?? meta?.segments
  const useSegmentFlow = Boolean(segments && segments.length > 0)

  const browsedFiles = meta?.browsedFiles ?? []
  const hadThinking = meta?.hadThinking ?? hadThinkingLive
  // Keep the UI at a high-level status; raw provider reasoning remains internal.
  const thinkingText = hadThinking
    ? isThinkingLive
      ? '正在分析任务目标与约束'
      : '已完成任务分析'
    : ''

  const durationSec =
    meta?.durationSec ??
    (liveStartedAt != null ? Math.max(0, Math.round((Date.now() - liveStartedAt) / 1000)) : undefined)

  useEffect(() => {
    if (liveStartedAt == null || !isStreaming) return
    const tick = () => setLiveSec(Math.max(0, Math.round((Date.now() - liveStartedAt) / 1000)))
    tick()
    const id = window.setInterval(tick, 500)
    return () => window.clearInterval(id)
  }, [liveStartedAt, isStreaming])

  const shownDuration =
    durationSec != null ? durationSec : liveStartedAt != null ? liveSec : undefined

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

  const extractedFinal = useSegmentFlow
    ? extractFinalContent(segments!, { isStreaming })
    : ''
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
  const displayContent = isAborted
    ? finalContentRaw.replace(/\s*_\((?:已停止|stopped)\)_\s*$/iu, '').trim()
    : finalContent

  // 文字 + 内联演示按时间顺序交错（可在 demo 上/下）
  const answerParts = useMemo(() => {
    if (!useSegmentFlow || !segments?.length || isError || isAborted) return []
    return buildAnswerParts(segments, { isStreaming })
  }, [useSegmentFlow, segments, isStreaming, isError, isAborted])

  const processOnly = useSegmentFlow ? processSegments(segments!, { isStreaming }) : []
  // 过程区不再重复：主区已展示的文字 / 内联演示
  const answerTextIds = useMemo(
    () => new Set(answerParts.filter((p) => p.type === 'text').map((p) => p.id)),
    [answerParts]
  )
  const processForFlow = useMemo(
    () =>
      processOnly.filter((s) => {
        if (s.toolName === 'present_inline_demo') return false
        if (s.kind === 'text' && answerTextIds.has(s.id)) return false
        return true
      }),
    [processOnly, answerTextIds]
  )
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
  const hasPaintableDemo = answerParts.some(
    (p) => p.type === 'demo' && isInlineDemoPaintable(p.html)
  )
  const generatingDemo = Boolean(
    isStreaming && answerParts.some((p) => p.type === 'demo') && !hasPaintableDemo
  )
  const liveThinkText = useSegmentFlow ? liveThinkingText(segments!) : ''
  const showFinalBody =
    Boolean(children) ||
    (isStreaming ? hasLiveProse || hasPaintableDemo : hasAnswerStream) ||
    (Boolean(displayContent) &&
      (isError || isAborted || finalDecision.show) &&
      !useSegmentFlow)
  // 正文在上、过程在下：分隔线画在过程区顶部
  const showLiveProcess = Boolean(isStreaming) // 直播时始终有呼吸过程区
  const showCompletedProcess =
    !isStreaming && (hasExpandableProcess || (!useSegmentFlow && legacyExpandable))
  const showProcessBelowAnswer =
    showFinalBody &&
    (showLiveProcess ||
      hasExpandableProcess ||
      (!useSegmentFlow && legacyExpandable && flowOpen))
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

  const legacyProcessLabel = isStreaming
    ? activeTool
      ? '工作中'
      : '思考中'
    : hadThinking
      ? '已思考并完成'
      : '已处理'

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
              <span>已浏览</span>
              <span className="assistant-meta-chip-value">{browsedFiles.length} 个文件</span>
              <ChevronDown
                size={12}
                className={`assistant-meta-chevron ${filesOpen ? 'assistant-meta-chevron--open' : ''}`}
                aria-hidden
              />
            </button>
          )}
        </div>
      )}


      {/* 直播：思考/工具在上，正文与演示在下（对齐 Cursor） */}
      {isStreaming ? (
        <div
          className={`assistant-process-below assistant-process-below--live-top ${
            showFinalBody ? 'assistant-process-below--live-top-gap' : ''
          }`}
        >
          {useSegmentFlow ? (
            <div className="turn-flow-live-panel">
              <TurnFlow
                segments={processForFlow}
                isStreaming
                liveStartedAt={liveStartedAt}
                approvalWaiting={Boolean(approval)}
                thinkText={liveThinkText}
                contentStreaming={hasLiveProse || hasPaintableDemo}
                generatingDemo={generatingDemo}
                answerStreaming={Boolean(finalContentRaw.trim() || hasLiveProse)}
              />
            </div>
          ) : (
            <div className="turn-flow-live-panel">
              <TurnFlow
                segments={[]}
                isStreaming
                liveStartedAt={liveStartedAt}
                approvalWaiting={Boolean(approval)}
                thinkText={liveThinkText}
                contentStreaming={Boolean(finalContentRaw.trim())}
                generatingDemo={false}
                answerStreaming={Boolean(finalContentRaw.trim())}
              />
            </div>
          )}
        </div>
      ) : liveThinkText.trim() ? (
        <ThoughtDisclosure
          text={liveThinkText}
          open={thoughtOpen}
          onToggle={() => setThoughtOpen((o) => !o)}
          label={
            shownDuration != null ? `已思考 · ${formatDuration(shownDuration)}` : '已思考'
          }
        />
      ) : null}

      {/* 正文 / 错误 / 中止 */}
      {isAborted ? (
        <div className="assistant-aborted" role="status">
          <CircleStop size={15} aria-hidden />
          <div>
            <strong>任务已停止</strong>
            <span>{displayContent ? '已保留停止前生成的内容' : '未产生可保留的结果'}</span>
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
                  if (!isInlineDemoPaintable(part.html)) return null
                  return (
                    <InlineDemo
                      key={part.id}
                      html={part.html}
                      caption={part.caption}
                      streaming={Boolean(isStreaming && part.streaming)}
                    />
                  )
                }
                return isStreaming ? (
                  <StreamingMarkdown key={part.id} text={part.content} />
                ) : (
                  <MarkdownBody key={part.id}>{part.content}</MarkdownBody>
                )
              })
            ) : displayContent ? (
              isStreaming ? (
                <StreamingMarkdown text={displayContent} />
              ) : (
                <MarkdownBody>{displayContent}</MarkdownBody>
              )
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

      {/* 结束后：有真实工具步骤才给可展开摘要；闲聊/演示不占位 */}
      {showCompletedProcess ? (
        <div
          className={`assistant-process-below ${
            showProcessBelowAnswer ? 'assistant-process-below--quiet' : ''
          }`}
        >
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
              aria-label={`展开过程，${summary}`}
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
                <TurnFlow segments={processForFlow} isStreaming={false} />
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
                <div className="assistant-message-meta-panel" role="region" aria-label="处理步骤">
                  <ProcessTimeline steps={processSteps} />
                </div>
              </div>
            </div>
          ) : null}
        </div>
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

      {(displayContent ||
        answerParts.some((p) => p.type === 'text' && p.content.trim())) &&
        !isStreaming &&
        !isError && (
          <MessageActions
            content={
              displayContent ||
              answerParts
                .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
                .map((p) => p.content)
                .join('\n\n')
            }
            messageId={messageId}
          />
        )}
    </article>
  )
}
