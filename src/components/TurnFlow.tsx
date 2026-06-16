/**
 * 一回合有序过程流：思考块、旁白文字、工具步骤卡
 * @see src/README.md
 */
import { useState } from 'react'
import { MarkdownBody } from './MarkdownBody'
import { CodeDiffBlock } from './CodeDiffBlock'
import type { TurnSegment } from '../../shared/types'
import { processSegments } from '../../shared/turn-segments'
import './TurnFlow.css'

/** TurnFlow Props */
interface Props {
  segments: TurnSegment[]
  isStreaming?: boolean
  liveStartedAt?: number
  /** 是否展示 final 正文（直播时由外层单独渲染） */
  includeFinalText?: boolean
}

/** 秒数 → 显示文案 */
function formatDuration(sec: number): string {
  if (sec < 1) return '<1s'
  return `${sec}s`
}

/** 工具步骤图标 */
function ToolIcon({ active, done }: { active: boolean; done: boolean }) {
  if (done) {
    return (
      <span className="turn-flow-tool-icon turn-flow-tool-icon--done" aria-hidden>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path
            d="M5 12l4 4L19 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    )
  }
  return (
    <span
      className={`turn-flow-tool-icon ${active ? 'turn-flow-tool-icon--active' : ''}`}
      aria-hidden
    >
      {active ? <span className="turn-flow-tool-spinner" /> : null}
      {!active ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path
            d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      ) : null}
    </span>
  )
}

/** 思考块 */
function ThinkingBlock({
  segment,
  isStreaming,
  elapsedSec
}: {
  segment: TurnSegment
  isStreaming: boolean
  elapsedSec?: number
}) {
  const [collapsed, setCollapsed] = useState(false)
  const active = segment.status === 'active'
  const text = segment.content?.trim() ?? ''
  const label = active
    ? elapsedSec != null
      ? `思考中 · ${formatDuration(elapsedSec)}`
      : '思考中'
    : '已思考'

  return (
    <div
      className={`turn-flow-item turn-flow-item--thinking ${active ? 'turn-flow-item--active' : ''}`}
    >
      <button
        type="button"
        className="turn-flow-thinking-head"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
      >
        {active && isStreaming ? <span className="turn-flow-live-dot" aria-hidden /> : null}
        <span className="turn-flow-thinking-label">{label}</span>
        {text ? (
          <svg
            className={`turn-flow-chevron ${collapsed ? '' : 'turn-flow-chevron--open'}`}
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
        ) : null}
      </button>
      {!collapsed && text ? (
        <div className={`turn-flow-thinking-body ${active ? 'turn-flow-thinking-body--live' : ''}`}>
          <p className="turn-flow-thinking-text">{text}</p>
          {active && isStreaming ? <span className="turn-flow-caret" aria-hidden /> : null}
        </div>
      ) : null}
      {!collapsed && !text && active ? (
        <div className="turn-flow-thinking-wait">
          <span className="turn-flow-shimmer" aria-hidden />
        </div>
      ) : null}
    </div>
  )
}

/** 旁白文字块 */
function NarrationBlock({ segment, isStreaming }: { segment: TurnSegment; isStreaming: boolean }) {
  const active = segment.status === 'active'
  const content = segment.content?.trim() ?? ''
  if (!content) return null

  return (
    <div
      className={`turn-flow-item turn-flow-item--narration ${active ? 'turn-flow-item--active' : ''}`}
    >
      <div className="turn-flow-narration message-body--assistant">
        <MarkdownBody>{content}</MarkdownBody>
        {active && isStreaming ? (
          <span className="turn-flow-caret turn-flow-caret--inline" aria-hidden />
        ) : null}
      </div>
    </div>
  )
}

/** 展示行级 diff 的编辑类工具 */
const DIFF_TOOLS = new Set(['write_file', 'search_replace'])

/** 工具步骤卡 */
function ToolBlock({ segment }: { segment: TurnSegment }) {
  const active = segment.status === 'active'
  const done = segment.status === 'done'
  const title = segment.toolTitle ?? segment.toolName ?? '操作'
  const showDiff =
    done &&
    segment.fileDiff &&
    segment.toolName &&
    DIFF_TOOLS.has(segment.toolName)

  return (
    <div
      className={`turn-flow-item turn-flow-item--tool ${active ? 'turn-flow-item--active' : ''} ${done ? 'turn-flow-item--done' : ''}`}
    >
      <ToolIcon active={active} done={done} />
      <div className="turn-flow-tool-body">
        <span className="turn-flow-tool-title">{title}</span>
        {segment.toolDetail ? (
          <code className="turn-flow-tool-detail">{segment.toolDetail}</code>
        ) : null}
        {showDiff ? <CodeDiffBlock diff={segment.fileDiff} defaultExpanded /> : null}
      </div>
      {active ? <span className="turn-flow-tool-pulse" aria-hidden /> : null}
    </div>
  )
}

/** 按顺序渲染一回合过程流 */
export function TurnFlow({
  segments,
  isStreaming = false,
  liveStartedAt,
  includeFinalText = false
}: Props) {
  const display = includeFinalText
    ? segments
    : processSegments(segments, { isStreaming })

  if (display.length === 0) return null

  const elapsedSec =
    liveStartedAt != null && isStreaming
      ? Math.max(0, Math.round((Date.now() - liveStartedAt) / 1000))
      : undefined

  return (
    <div className="turn-flow" aria-live="polite">
      {display.map((seg, index) => {
        if (seg.kind === 'thinking') {
          return (
            <ThinkingBlock
              key={seg.id}
              segment={seg}
              isStreaming={isStreaming}
              elapsedSec={elapsedSec}
            />
          )
        }
        if (seg.kind === 'text') {
          if (seg.role === 'final' && !includeFinalText) return null
          return <NarrationBlock key={seg.id} segment={seg} isStreaming={isStreaming} />
        }
        if (seg.kind === 'tool') {
          return (
            <div
              key={seg.id}
              className="turn-flow-item-wrap"
              style={{ '--flow-index': String(index) } as Record<string, string>}
            >
              <ToolBlock segment={seg} />
            </div>
          )
        }
        return null
      })}
    </div>
  )
}
