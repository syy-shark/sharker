/**
 * 一回合专业执行轨道：理解、探索、执行、验证。
 * @see src/README.md
 */
import { useEffect, useRef, useState, type ComponentType } from 'react'
import {
  BadgeCheck,
  BrainCircuit,
  Check,
  ChevronDown,
  Circle,
  CircleAlert,
  FilePenLine,
  Hammer,
  Search
} from 'lucide-react'
import type { TurnSegment } from '../../shared/types'
import {
  deriveProcessPhases,
  type ProcessPhase,
  type ProcessPhaseGroup,
  type ProcessPhaseStep
} from '../../shared/process-phases'
import { CodeDiffBlock } from './CodeDiffBlock'
import { ThinkingIndicator } from './ThinkingIndicator'
import './TurnFlow.css'

interface Props {
  segments: TurnSegment[]
  isStreaming?: boolean
  liveStartedAt?: number
  /** 是否展示 final 正文（直播时由外层单独渲染） */
  includeFinalText?: boolean
}

const PHASE_ICONS: Record<ProcessPhase, ComponentType<{ size?: number; 'aria-hidden'?: boolean }>> = {
  understand: BrainCircuit,
  explore: Search,
  execute: Hammer,
  verify: BadgeCheck
}

const DIFF_TOOLS = new Set(['write_file', 'search_replace', 'apply_patch'])

type FileChangeRow = {
  key: string
  path: string
  stats: { added: number; removed: number }
  diff?: NonNullable<TurnSegment['fileDiff']>
}

function formatDuration(seconds: number): string {
  if (seconds < 1) return '<1s'
  return `${seconds}s`
}

function basenamePath(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || path
}

function fileChangeRows(segment: TurnSegment): FileChangeRow[] {
  const diffs = segment.fileDiffs?.length
    ? segment.fileDiffs
    : segment.fileDiff
      ? [segment.fileDiff]
      : []
  if (diffs.length > 0) {
    return diffs.map((diff, index) => ({
      key: `${segment.id}-${diff.path}-${index}`,
      path: diff.path,
      stats: diff.stats,
      diff
    }))
  }

  if (segment.editPreview?.length) {
    return segment.editPreview.map((preview, index) => ({
      key: `${segment.id}-${preview.path}-${index}`,
      path: preview.path,
      stats: preview.stats
    }))
  }

  const fallback = segment.toolDetail ?? segment.toolTitle ?? '文件'
  return [{ key: `${segment.id}-pending`, path: fallback, stats: { added: 0, removed: 0 } }]
}

function useAnimatedNumber(target: number): number {
  const [value, setValue] = useState(0)
  const valueRef = useRef(0)

  useEffect(() => {
    const safeTarget = Math.max(0, Math.round(target))
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion || safeTarget === valueRef.current) {
      valueRef.current = safeTarget
      setValue(safeTarget)
      return
    }

    const from = valueRef.current
    const distance = Math.abs(safeTarget - from)
    const duration = Math.min(1200, Math.max(600, distance * 3))
    let frame = 0
    let startedAt: number | null = null
    const tick = (now: number) => {
      if (startedAt == null) startedAt = now
      const progress = Math.min(1, (now - startedAt) / duration)
      const eased = 1 - Math.pow(1 - progress, 2)
      const next = Math.round(from + (safeTarget - from) * eased)
      valueRef.current = next
      setValue(next)
      if (progress < 1) frame = window.requestAnimationFrame(tick)
    }

    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [target])

  return value
}

function FileChangeItem({ row, active, done }: { row: FileChangeRow; active: boolean; done: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const canExpand = done && Boolean(row.diff)
  const displayedAdded = useAnimatedNumber(row.stats.added)
  const displayedRemoved = useAnimatedNumber(row.stats.removed)

  return (
    <div className="turn-flow-file-change">
      <div className="turn-flow-file-line">
        <FilePenLine size={14} aria-hidden />
        <span className="turn-flow-file-name" title={row.path}>
          {basenamePath(row.path)}
        </span>
        <span
          className="turn-flow-file-stats"
          aria-label={`新增 ${row.stats.added} 行，删除 ${row.stats.removed} 行`}
        >
          <span className="turn-flow-file-stat turn-flow-file-stat--add" aria-hidden>+{displayedAdded}</span>
          <span className="turn-flow-file-stat turn-flow-file-stat--del" aria-hidden>-{displayedRemoved}</span>
        </span>
        {canExpand ? (
          <button
            type="button"
            className="turn-flow-file-diff-button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            aria-label={`${expanded ? '收起' : '展开'} ${basenamePath(row.path)} 的 diff`}
          >
            <span>Diff</span>
            <ChevronDown
              size={13}
              className={expanded ? 'turn-flow-file-chevron turn-flow-file-chevron--open' : 'turn-flow-file-chevron'}
              aria-hidden
            />
          </button>
        ) : (
          <span className="turn-flow-file-status">{active ? '写入中' : '已完成'}</span>
        )}
      </div>
      {expanded && row.diff ? (
        <div className="turn-flow-file-diff">
          <CodeDiffBlock diff={row.diff} defaultExpanded showHeader={false} />
        </div>
      ) : null}
    </div>
  )
}

function FileChangeBlock({ segment }: { segment: TurnSegment }) {
  const active = segment.status === 'active'
  const done = segment.status === 'done'
  return (
    <div className="turn-flow-file-changes">
      {fileChangeRows(segment).map((row) => (
        <FileChangeItem key={row.key} row={row} active={active} done={done} />
      ))}
    </div>
  )
}

function StepMarker({ status }: { status: ProcessPhaseStep['status'] }) {
  if (status === 'error') {
    return (
      <span className="turn-flow-step-marker turn-flow-step-marker--error" aria-hidden>
        <CircleAlert size={13} />
      </span>
    )
  }
  if (status === 'active') {
    return (
      <span className="turn-flow-step-marker turn-flow-step-marker--active" aria-hidden>
        <Circle size={10} fill="currentColor" />
      </span>
    )
  }
  return (
    <span className="turn-flow-step-marker turn-flow-step-marker--done" aria-hidden>
      <Check size={13} />
    </span>
  )
}

function ProcessStepRow({ step }: { step: ProcessPhaseStep }) {
  const segment = step.segment
  const isDiffTool = Boolean(segment.toolName && DIFF_TOOLS.has(segment.toolName))
  return (
    <li className={`turn-flow-step turn-flow-step--${step.status}`}>
      <StepMarker status={step.status} />
      <div className="turn-flow-step-content">
        <div className="turn-flow-step-copy">
          <span className="turn-flow-step-title">{step.title}</span>
          {step.detail && !isDiffTool ? (
            <code className="turn-flow-step-detail" title={segment.toolDetail}>
              {step.detail}
            </code>
          ) : null}
        </div>
        {isDiffTool ? <FileChangeBlock segment={segment} /> : null}
      </div>
    </li>
  )
}

function currentPhaseSteps(group: ProcessPhaseGroup): ProcessPhaseStep[] {
  const unique = dedupePhaseSteps(group.steps)
  const active = unique.find((step) => step.status === 'active')
  if (!active) {
    return unique.slice(-3).filter((step) => !duplicatesPhaseHeader(step, group))
  }
  const activeIndex = unique.findIndex((step) => step.id === active.id)
  const completed = unique
    .slice(0, activeIndex)
    .filter((step) => step.status === 'done')
    .slice(-2)
  return [...completed, active].filter((step) => !duplicatesPhaseHeader(step, group))
}

function dedupePhaseSteps(steps: ProcessPhaseStep[]): ProcessPhaseStep[] {
  const unique: ProcessPhaseStep[] = []
  for (const step of steps) {
    const previous = unique[unique.length - 1]
    const duplicate =
      previous &&
      previous.phase === step.phase &&
      previous.kind === step.kind &&
      previous.title === step.title &&
      previous.detail === step.detail
    if (duplicate && (step.kind === 'thinking' || step.kind === 'status')) {
      unique[unique.length - 1] = step
    } else {
      unique.push(step)
    }
  }
  return unique
}

const GENERIC_PHASE_META_TITLES: Record<ProcessPhase, ReadonlySet<string>> = {
  understand: new Set([
    '分析任务目标与约束',
    '正在分析任务目标与约束',
    '已完成任务分析',
    '任务与约束已梳理'
  ]),
  explore: new Set(['探索项目上下文', '等待探索']),
  execute: new Set(['执行任务修改', '等待执行']),
  verify: new Set(['验证执行结果', '等待验证', '验证完成'])
}

function isMetaStep(step: ProcessPhaseStep): boolean {
  return step.kind === 'thinking' || step.kind === 'status'
}

function isGenericPhaseMetaStep(step: ProcessPhaseStep, group: ProcessPhaseGroup): boolean {
  return (
    isMetaStep(step) &&
    (step.title === group.summary || GENERIC_PHASE_META_TITLES[group.phase].has(step.title))
  )
}

function completedPhaseSteps(group: ProcessPhaseGroup): ProcessPhaseStep[] {
  const unique = dedupePhaseSteps(group.steps)
  if (unique.length === 1 && isMetaStep(unique[0]) && unique[0].status !== 'error') return []
  return unique.filter((step) => step.status === 'error' || !isGenericPhaseMetaStep(step, group))
}

function duplicatesPhaseHeader(step: ProcessPhaseStep, group: ProcessPhaseGroup): boolean {
  return isGenericPhaseMetaStep(step, group)
}

function PhaseSection({
  group,
  expanded,
  compact,
  elapsed
}: {
  group: ProcessPhaseGroup
  expanded: boolean
  compact: boolean
  elapsed?: string
}) {
  const Icon = PHASE_ICONS[group.phase]
  const steps = expanded
    ? compact
      ? currentPhaseSteps(group)
      : completedPhaseSteps(group)
    : []

  return (
    <section
      className={`turn-flow-phase turn-flow-phase--${group.state}`}
      aria-label={`${group.label}阶段：${group.summary}`}
    >
      <div className="turn-flow-phase-rail" aria-hidden>
        <span className="turn-flow-phase-icon">
          <Icon size={15} aria-hidden />
        </span>
      </div>
      <div className="turn-flow-phase-content">
        <div className="turn-flow-phase-header">
          <span className="turn-flow-phase-label">{group.label}</span>
          <span className="turn-flow-phase-summary" title={group.summary}>
            {group.summary}
          </span>
          {group.state === 'active' && elapsed ? (
            <span className="turn-flow-phase-time">{elapsed}</span>
          ) : null}
        </div>
        {expanded && steps.length > 0 ? (
          <ol className="turn-flow-steps">
            {steps.map((step) => (
              <ProcessStepRow key={step.id} step={step} />
            ))}
          </ol>
        ) : null}
      </div>
    </section>
  )
}

/** 按阶段渲染一回合过程；thinking 只转为高层步骤，不渲染原始内容。 */
export function TurnFlow({
  segments,
  isStreaming = false,
  liveStartedAt,
  includeFinalText: _includeFinalText = false
}: Props) {
  const model = deriveProcessPhases(segments, { isStreaming })
  const groups = model.groups.filter((group) => group.steps.length > 0)
  if (groups.length === 0) return null

  const populatedSteps = groups.flatMap((group) => group.steps)
  const onlyThinking =
    isStreaming &&
    populatedSteps.length > 0 &&
    populatedSteps.every((step) => step.kind === 'thinking') &&
    populatedSteps.some((step) => step.status === 'active')

  const elapsed =
    isStreaming && liveStartedAt != null
      ? formatDuration(Math.max(0, Math.round((Date.now() - liveStartedAt) / 1000)))
      : undefined

  if (onlyThinking) {
    return <ThinkingIndicator elapsed={elapsed} />
  }

  return (
    <div className="turn-flow turn-flow--timeline" role="region" aria-label="Agent 执行过程" aria-live="polite">
      {groups.map((group) => {
        const expanded = isStreaming ? group.phase === model.currentPhase : group.steps.length > 0
        return (
          <PhaseSection
            key={group.phase}
            group={group}
            expanded={expanded}
            compact={isStreaming}
            elapsed={elapsed}
          />
        )
      })}
    </div>
  )
}
