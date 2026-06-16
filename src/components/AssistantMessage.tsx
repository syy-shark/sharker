/**
 * AI 助手消息：有序过程流（思考/旁白/工具）+ 最终回答
 * @see src/README.md
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { MarkdownBody } from './MarkdownBody'
import type { AssistantMeta, TurnSegment } from '../../shared/types'
import { buildProcessSteps, canExpandProcess } from '../../shared/process-steps'
import {
  extractFinalContent,
  hasProcessFlow,
  processSegments,
  summarizeSegments
} from '../../shared/turn-segments'
import { skillActivityLabel } from '../../shared/turn-meta'
import { MessageActions } from './MessageActions'
import { ProcessTimeline } from './ProcessTimeline'
import { TurnFlow } from './TurnFlow'
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
  turnThinking?: string
  isThinkingLive?: boolean
  activeTool?: string | null
  liveStartedAt?: number
  isStreaming?: boolean
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
  turnThinking = '',
  isThinkingLive = false,
  activeTool = null,
  liveStartedAt,
  isStreaming,
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
  const thinkingText = turnThinking.trim() || meta?.thinkingPreview?.trim() || ''

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

  useEffect(() => {
    if (!isStreaming || !useSegmentFlow) {
      if (!isStreaming) userToggledFlow.current = false
      return
    }
    if (!userToggledFlow.current) setFlowOpen(true)
  }, [isStreaming, useSegmentFlow, segments?.length])

  const finalContent = useSegmentFlow
    ? extractFinalContent(segments!, { isStreaming })
    : content.trim()

  const processOnly = useSegmentFlow ? processSegments(segments!, { isStreaming }) : []
  const showFlowPanel = useSegmentFlow && (isStreaming ? true : flowOpen)
  const summary = useSegmentFlow
    ? summarizeSegments(segments!, meta?.durationSec ?? shownDuration)
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
      {showMetaRow && !useSegmentFlow && (
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
                  {isStreaming ? <span className="assistant-meta-live-dot" aria-hidden /> : null}
                  <span>{legacyProcessLabel}</span>
                  <span className="assistant-meta-chip-value">
                    {shownDuration != null ? formatDuration(shownDuration) : '…'}
                  </span>
                  <svg
                    className={`assistant-meta-chevron ${flowOpen ? 'assistant-meta-chevron--open' : ''}`}
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    aria-hidden
                  >
                    <path
                      d="M3 4.5 6 7.5 9 4.5"
                      stroke="currentColor"
                      strokeWidth="1.25"
                      fill="none"
                      strokeLinecap="round"
                    />
                  </svg>
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
              <svg
                className={`assistant-meta-chevron ${filesOpen ? 'assistant-meta-chevron--open' : ''}`}
                width="12"
                height="12"
                viewBox="0 0 12 12"
                aria-hidden
              >
                <path
                  d="M3 4.5 6 7.5 9 4.5"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* 新过程流：结束后摘要 chip */}
      {useSegmentFlow && !isStreaming && hasProcessFlow(segments!) && summary ? (
        <button
          type="button"
          className="turn-flow-summary-chip"
          onClick={() => {
            userToggledFlow.current = true
            setFlowOpen((o) => !o)
          }}
          aria-expanded={flowOpen}
        >
          <span>{summary}</span>
          <svg
            className={`assistant-meta-chevron ${flowOpen ? 'assistant-meta-chevron--open' : ''}`}
            width="12"
            height="12"
            viewBox="0 0 12 12"
            aria-hidden
          >
            <path
              d="M3 4.5 6 7.5 9 4.5"
              stroke="currentColor"
              strokeWidth="1.25"
              fill="none"
              strokeLinecap="round"
            />
          </svg>
        </button>
      ) : null}

      {useSegmentFlow && isStreaming && shownDuration != null ? (
        <div className="turn-flow-summary-chip turn-flow-summary-chip--live">
          <span className="turn-flow-live-dot" aria-hidden />
          <span>生成中 · {formatDuration(shownDuration)}</span>
        </div>
      ) : null}

      {/* 过程流面板 */}
      {useSegmentFlow && showFlowPanel && processOnly.length > 0 ? (
        <TurnFlow
          segments={segments!}
          isStreaming={isStreaming}
          liveStartedAt={liveStartedAt}
        />
      ) : null}

      {/* 旧 ProcessTimeline 回退 */}
      {legacyExpandable && flowOpen && !useSegmentFlow ? (
        <div className="assistant-process-wrap assistant-process-wrap--open">
          <div className="assistant-process-inner">
            <div className="assistant-message-meta-panel" role="region" aria-label="处理步骤">
              <ProcessTimeline steps={processSteps} />
            </div>
          </div>
        </div>
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

      {(finalContent || children) && (
        <div
          className={`assistant-message-body message-body--assistant ${
            isStreaming ? 'turn-flow-final turn-flow-final--streaming message-body--streaming-active' : 'turn-flow-final'
          }`}
        >
          {children ?? <MarkdownBody>{finalContent}</MarkdownBody>}
        </div>
      )}

      {finalContent && !isStreaming && (
        <MessageActions content={finalContent} messageId={messageId} />
      )}
    </article>
  )
}
