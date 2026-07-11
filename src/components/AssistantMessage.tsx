/**
 * AI 助手消息：有序过程流（思考/旁白/工具）+ 最终回答
 * @see src/README.md
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ChevronDown, CircleStop, RotateCcw } from 'lucide-react'
import { MarkdownBody } from './MarkdownBody'
import type { ApprovalRequest, AssistantMeta, TurnSegment } from '../../shared/types'
import { buildProcessSteps, canExpandProcess } from '../../shared/process-steps'
import {
  extractFinalContent,
  hasProcessFlow,
  processSegments
} from '../../shared/turn-segments'
import { deriveProcessPhases, summarizeProcessPhases } from '../../shared/process-phases'
import { skillActivityLabel } from '../../shared/turn-meta'
import { MessageActions } from './MessageActions'
import { ProcessTimeline } from './ProcessTimeline'
import { ThinkingIndicator } from './ThinkingIndicator'
import { TurnFlow } from './TurnFlow'
import { InlineApproval } from './InlineApproval'
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
  onApproval?: (approved: boolean) => void | Promise<void>
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

  const skillNames = useMemo(
    () =>
      meta?.activities.filter((a) => a.kind === 'skill').map((a) => a.label.split(':')[0] ?? a.label) ??
      [],
    [meta?.activities]
  )

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
  const legacyThinkingOnly =
    !useSegmentFlow &&
    Boolean(isStreaming) &&
    !activeTool &&
    processSteps.length > 0 &&
    processSteps.every((step) => step.kind === 'think')

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

  const finalContent = useSegmentFlow
    ? extractFinalContent(segments!, { isStreaming })
    : content.trim()
  const isError = meta?.outcome === 'error' || /^\*\*错误\*\*:?/u.test(finalContent)
  const isAborted = meta?.outcome === 'aborted'
  const displayContent = isAborted
    ? finalContent.replace(/\s*_\((?:已停止|stopped)\)_\s*$/iu, '').trim()
    : finalContent

  const processOnly = useSegmentFlow ? processSegments(segments!, { isStreaming }) : []
  const showFlowPanel = useSegmentFlow && (isStreaming ? true : flowOpen)
  const showFinalDivider =
    (useSegmentFlow && processOnly.length > 0 && showFlowPanel) ||
    (!useSegmentFlow && legacyExpandable && flowOpen)
  const phaseModel = useMemo(
    () => (useSegmentFlow ? deriveProcessPhases(segments!, { isStreaming }) : null),
    [isStreaming, segments, useSegmentFlow]
  )
  const summary = phaseModel
    ? summarizeProcessPhases(phaseModel, meta?.durationSec ?? shownDuration)
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
      {legacyThinkingOnly ? (
        <ThinkingIndicator
          elapsed={shownDuration != null ? formatDuration(shownDuration) : undefined}
        />
      ) : null}

      {showMetaRow && !useSegmentFlow && !legacyThinkingOnly && (
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

      {/* 新过程流：结束后摘要 chip */}
      {useSegmentFlow && !isStreaming && hasProcessFlow(segments!) && summary ? (
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
        >
          <span>{summary}</span>
          <ChevronDown
            size={12}
            className={`assistant-meta-chevron ${flowOpen ? 'assistant-meta-chevron--open' : ''}`}
            aria-hidden
          />
        </button>
      ) : null}

      {/* 过程流面板 */}
      {useSegmentFlow && processOnly.length > 0 ? (
        <div
          className={`turn-flow-collapse ${showFlowPanel ? 'turn-flow-collapse--open' : ''}`}
          aria-hidden={!showFlowPanel}
          inert={showFlowPanel ? undefined : true}
        >
          <div className="turn-flow-collapse-inner">
            <TurnFlow
              segments={segments!}
              isStreaming={isStreaming}
              liveStartedAt={liveStartedAt}
            />
          </div>
        </div>
      ) : null}

      {/* 旧 ProcessTimeline 回退 */}
      {legacyExpandable && flowOpen && !useSegmentFlow && !legacyThinkingOnly ? (
        <div className="assistant-process-wrap assistant-process-wrap--open">
          <div className="assistant-process-inner">
            <div className="assistant-message-meta-panel" role="region" aria-label="处理步骤">
              <ProcessTimeline steps={processSteps} />
            </div>
          </div>
        </div>
      ) : null}

      {approval && onApproval ? (
        <InlineApproval
          request={approval}
          responding={approvalResponding}
          onRespond={onApproval}
        />
      ) : null}

      {filesOpen && browsedFiles.length > 0 && (
        <ul className="assistant-message-files">
          {browsedFiles.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}

      {skillNames.length > 0 && (
        <p className="assistant-message-hook">
          已载入技能 <code>{skillActivityLabel(skillNames[0])}</code>
        </p>
      )}

      {isAborted ? (
        <div className="assistant-aborted" role="status">
          <CircleStop size={15} aria-hidden />
          <div>
            <strong>任务已停止</strong>
            <span>{displayContent ? '已保留停止前生成的内容' : '未产生可保留的结果'}</span>
          </div>
        </div>
      ) : null}

      {isError && finalContent ? (
        <div className="assistant-error" role="alert">
          <div className="assistant-error-head">
            <AlertTriangle size={16} aria-hidden />
            <div>
              <strong>任务未完成</strong>
              <span>{finalContent.replace(/\*\*错误\*\*:?\s*/g, '').split('\n')[0] || '请求执行失败'}</span>
            </div>
            {onRetry ? (
              <button type="button" className="assistant-error-retry" onClick={onRetry}>
                <RotateCcw size={14} aria-hidden />
                重试
              </button>
            ) : null}
          </div>
          <details className="assistant-error-details">
            <summary>查看详情 <ChevronDown size={13} aria-hidden /></summary>
            <MarkdownBody>{finalContent}</MarkdownBody>
          </details>
        </div>
      ) : (displayContent || children) && (
        <div
          className={`assistant-message-body message-body--assistant ${
            isStreaming
              ? 'turn-flow-final turn-flow-final--streaming message-body--streaming-active'
              : 'turn-flow-final'
          } ${
            showFinalDivider ? 'turn-flow-final--separated' : ''
          }`}
        >
          {children ?? <MarkdownBody>{displayContent}</MarkdownBody>}
        </div>
      )}

      {displayContent && !isStreaming && !isError && (
        <MessageActions content={displayContent} messageId={messageId} />
      )}
    </article>
  )
}
