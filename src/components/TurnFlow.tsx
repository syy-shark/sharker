/**
 * 一回合过程时间线（Mac 式安静直播）：
 * - 不重复展示阶段名（无「理解」叠「理解」）
 * - 无大脑/绿色对号等喧闹图标；细轨 + 微点
 * - 直播时逐步出现，完成后由外层 summary 收起
 * - 直播头标签始终等于下方展示步骤的最后一项，避免“头停住、列表在走”
 * @see src/ARCH.md · docs/ui-style.md
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { TurnSegment } from '../../shared/types'
import {
  deriveChronologicalSteps,
  deriveProcessPhases,
  type ProcessPhase,
  type ProcessPhaseStep
} from '../../shared/process-phases'
import { buildLiveHead, shouldSynthesizePlanning } from '../../shared/live-display'
import { InlineDemo } from './InlineDemo'
import './TurnFlow.css'

interface Props {
  segments: TurnSegment[]
  isStreaming?: boolean
  liveStartedAt?: number
  /** 是否展示 final 正文（直播时由外层单独渲染） */
  includeFinalText?: boolean
  /** 等待用户审批时保持明确直播态 */
  approvalWaiting?: boolean
  /**
   * 是否已有最终回答在流式输出。
   * 用于区分「工具间隙规划下一步」与「真正生成回答」，避免过程区误跳到“生成回答中”像停住。
   */
  answerStreaming?: boolean
}

/** 与阶段标题同义的噪音，不应单独占一行 */
const PHASE_ECHO = new Set(['理解', '探索', '执行', '验证', '工作中', '思考中'])

type DisplayStep = {
  id: string
  title: string
  detail?: string
  status: ProcessPhaseStep['status']
  kind: ProcessPhaseStep['kind'] | 'synthetic'
  source?: ProcessPhaseStep
}

function formatDuration(seconds: number): string {
  if (seconds < 1) return '<1s'
  return `${seconds}s`
}

const PHASE_LIVE_LABEL: Record<ProcessPhase, string> = {
  understand: '理解中',
  explore: '探索中',
  execute: '执行中',
  verify: '验证中'
}

function isGenericMetaStep(step: ProcessPhaseStep): boolean {
  // thinking 原文永不作为时间线步骤标题暴露（统一折叠为高层状态）
  if (step.kind === 'thinking') return true
  if (step.kind !== 'status') return false
  if (PHASE_ECHO.has(step.title.trim())) return true
  const generic = new Set([
    '分析任务目标与约束',
    '正在分析任务目标与约束',
    '已完成任务分析',
    '任务与约束已梳理',
    '探索项目上下文',
    '等待探索',
    '执行任务修改',
    '等待执行',
    '验证执行结果',
    '等待验证',
    '验证完成',
    '等待分析'
  ])
  return generic.has(step.title)
}

/** 仅直播桥接态：完成后不应留在历史时间线（如规划下一步 / 连接准备） */
function isBridgeStatusStep(step: ProcessPhaseStep): boolean {
  if (step.kind !== 'status' && step.kind !== 'thinking') return false
  const title = step.title.trim()
  if (!title) return false
  if (title.includes('规划下一步')) return true
  if (title.includes('连接模型并准备')) return true
  if (title.startsWith('正在准备')) return true
  if (title.includes('已确认') || title.includes('继续执行')) return true
  if (title.includes('已授权') || title.includes('已拒绝该操作，继续')) return true
  if (title === '处理中' || title === '思考中') return true
  return false
}

/** 相邻重复合并：同标题同详情只留最新一条 */
function dedupeChronological(steps: ProcessPhaseStep[]): ProcessPhaseStep[] {
  const unique: ProcessPhaseStep[] = []
  for (const step of steps) {
    const previous = unique[unique.length - 1]
    const duplicate =
      previous &&
      previous.kind === step.kind &&
      previous.title === step.title &&
      previous.detail === step.detail &&
      (step.kind === 'thinking' || step.kind === 'status' || step.kind === 'narration')
    if (duplicate) {
      unique[unique.length - 1] = step
    } else {
      unique.push(step)
    }
  }
  return unique
}

/**
 * 直播：实质步骤按序出现；纯元信息在尚无实质步骤时折叠进顶部「处理中」。
 * 完成：去掉元信息与内联演示（演示在消息主区）。
 */
function visibleSteps(steps: ProcessPhaseStep[], isStreaming: boolean): ProcessPhaseStep[] {
  const unique = dedupeChronological(steps).filter((s) => !PHASE_ECHO.has(s.title.trim()))

  if (isStreaming) {
    const hasSubstance = unique.some(
      (s) =>
        s.kind === 'tool' ||
        s.kind === 'narration' ||
        (s.kind === 'status' && !isGenericMetaStep(s) && !isBridgeStatusStep(s)) ||
        (s.status === 'active' && !isGenericMetaStep(s) && !isBridgeStatusStep(s))
    )
    return unique.filter((step) => {
      if (step.status === 'error') return true
      if (step.kind === 'tool' || step.kind === 'narration') return true
      // 直播中已完成的桥接 status（连接模型/规划/准备）不要残留在时间线，避免像“回跳准备”
      if (isBridgeStatusStep(step) && step.status !== 'active') return false
      if (isGenericMetaStep(step)) {
        // 有实质步骤后，不再刷「分析任务目标」一类空壳
        return !hasSubstance && step.status === 'active'
      }
      // 有实质步骤后，active 桥接也只保留「规划下一步」一类当前头，不重复挂旧准备态
      if (hasSubstance && isBridgeStatusStep(step) && !step.title.includes('规划下一步')) {
        return false
      }
      return true
    })
  }

  const hasToolSteps = unique.some((s) => s.kind === 'tool')
  return unique.filter((step) => {
    if (step.status === 'error') return true
    if (step.segment.toolName === 'present_inline_demo') return false
    if (step.kind === 'tool' || step.kind === 'narration') return true
    // 完成后去掉纯桥接 status，避免历史里挂着「规划下一步」像没结束
    if (isBridgeStatusStep(step)) return false
    if (isGenericMetaStep(step)) return false
    // 有真实工具步骤时，去掉“读取文件/列出目录”这类 status 回声，只保留 tool 行
    if (
      hasToolSteps &&
      step.kind === 'status' &&
      (step.segment.toolName || /^(读取|列出|运行|写入|修改|搜索)/.test(step.title.trim()))
    ) {
      return false
    }
    return true
  })
}

function toDisplayStep(step: ProcessPhaseStep): DisplayStep {
  const waitingApproval = Boolean(step.segment.approval) && step.status === 'active'
  return {
    id: step.id,
    title: waitingApproval ? `等待确认 · ${step.title}` : step.title,
    detail: step.detail,
    status: step.status,
    kind: step.kind,
    source: step
  }
}

/**
 * 最终展示用步骤列表（含合成「规划下一步 / 生成回答 / 思考中」）。
 * 直播头标签直接取最后一项，保证与下方列表永远同步。
 */
function buildDisplaySteps(options: {
  steps: ProcessPhaseStep[]
  isStreaming: boolean
  approvalWaiting: boolean
  generatingAnswer: boolean
  planningNext: boolean
  showThinkingPlaceholder: boolean
}): DisplayStep[] {
  const {
    steps,
    isStreaming,
    approvalWaiting,
    generatingAnswer,
    planningNext,
    showThinkingPlaceholder
  } = options

  if (!isStreaming) return steps.map(toDisplayStep)

  if (showThinkingPlaceholder) {
    return [
      {
        id: 'synthetic-thinking',
        title: '思考中',
        detail: '分析任务并规划下一步…',
        status: 'active',
        kind: 'synthetic'
      }
    ]
  }

  const display = steps.map(toDisplayStep)
  const lastTitle = display.at(-1)?.title || ''

  if (generatingAnswer) {
    display.push({
      id: 'synthetic-answer',
      title: '生成回答中',
      detail: '整理结果并输出…',
      status: 'active',
      kind: 'synthetic'
    })
    return display
  }

  if (planningNext && !lastTitle.includes('规划下一步')) {
    display.push({
      id: 'synthetic-planning',
      title: '规划下一步',
      detail: '根据已完成步骤决定下一动作…',
      status: 'active',
      kind: 'synthetic'
    })
  }

  if (approvalWaiting && display.length === 0) {
    display.push({
      id: 'synthetic-approval',
      title: '等待确认',
      detail: '高危操作需要你确认后才能继续',
      status: 'active',
      kind: 'synthetic'
    })
  }

  return display
}

function ProcessStepRow({
  step,
  isLast
}: {
  step: DisplayStep
  isLast: boolean
}) {
  const segment = step.source?.segment
  const isDemo =
    Boolean(segment?.toolName === 'present_inline_demo' && segment?.content?.trim())
  const title = step.title

  return (
    <li
      className={[
        'turn-flow-step',
        `turn-flow-step--${step.status}`,
        isLast ? 'turn-flow-step--last' : ''
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="turn-flow-step-rail" aria-hidden>
        <span className={`turn-flow-step-dot turn-flow-step-dot--${step.status}`} />
        {!isLast ? <span className="turn-flow-step-line" /> : null}
      </span>
      <div className="turn-flow-step-content">
        <div className="turn-flow-step-copy">
          <span className="turn-flow-step-title">{title}</span>
          {step.status === 'active' ? <span className="live-dot turn-flow-step-live-dot" aria-hidden /> : null}
          {step.detail && !isDemo ? (
            <code className="turn-flow-step-detail" title={step.detail || segment?.toolDetail}>
              {step.detail}
            </code>
          ) : null}
        </div>
        {isDemo && step.status !== 'error' && segment?.content ? (
          <div className="turn-flow-inline-demo">
            <InlineDemo html={segment.content} caption={segment.toolDetail} />
          </div>
        ) : null}
        {!isDemo &&
        segment?.resultSummary &&
        step.status !== 'error' &&
        segment.resultSummary.trim() !== (step.detail ?? '').trim() &&
        // 不把源码/JSON 首行当步骤结果文案（完整输出仍可在 details 查看）
        !/^(L\d+:|[{}\[\]]|```)/.test(segment.resultSummary.trim()) &&
        // 中止后进度心跳不重复展示；仅直播 active 时显示“执行中…”
        !(
          step.status !== 'active' &&
          (/^(已启动|执行中|运行中|处理中)/.test(segment.resultSummary.trim()) ||
            /执行中…\s*\d+s/.test(segment.resultSummary) ||
            /·\s*\d+s$/.test(segment.resultSummary.trim()))
        ) ? (
          <span
            className={`turn-flow-step-result${
              step.status === 'active' ? ' turn-flow-step-result--live' : ''
            }`}
          >
            {segment.resultSummary}
          </span>
        ) : null}
        {segment?.exitCode != null ? (
          <span
            className={`turn-flow-step-exit ${
              segment.exitCode === 0 ? 'turn-flow-step-exit--ok' : 'turn-flow-step-exit--err'
            }`}
          >
            退出码 {segment.exitCode}
          </span>
        ) : null}
        {step.status === 'error' ? (
          <span className="turn-flow-step-error">{segment?.errorMessage || '操作失败'}</span>
        ) : null}
        {!isDemo && segment?.resultOutput && segment.resultOutput !== segment.resultSummary ? (
          <details className="turn-flow-step-output">
            <summary>查看输出</summary>
            <pre>{segment.resultOutput}</pre>
          </details>
        ) : null}
      </div>
    </li>
  )
}

/** 按先后顺序渲染过程；直播时逐步追加，不做阶段折叠。 */
export function TurnFlow({
  segments,
  isStreaming = false,
  liveStartedAt,
  includeFinalText: _includeFinalText = false,
  approvalWaiting = false,
  answerStreaming = false
}: Props) {
  const [now, setNow] = useState(() => Date.now())
  /** 直播头文案短时粘滞，避免工具/规划/回答边界抖动 */
  const [stickyLive, setStickyLive] = useState<{ label: string; detail?: string }>({
    label: '处理中'
  })
  const stickyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSwapAtRef = useRef(0)
  useEffect(() => {
    if (!isStreaming) return
    const id = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [isStreaming])
  useEffect(() => {
    return () => {
      if (stickyTimerRef.current) clearTimeout(stickyTimerRef.current)
    }
  }, [])

  const chronological = deriveChronologicalSteps(segments, { isStreaming })
  const steps = visibleSteps(chronological, isStreaming)
  const phaseModel = deriveProcessPhases(segments, { isStreaming })

  const fallbackStartedAt =
    liveStartedAt ??
    chronological.find((step) => step.segment.startedAt != null)?.segment.startedAt ??
    chronological[0]?.segment.startedAt
  const elapsedSec =
    isStreaming && fallbackStartedAt != null
      ? Math.max(0, Math.round((now - fallbackStartedAt) / 1000))
      : null
  const elapsed = elapsedSec != null ? formatDuration(elapsedSec) : undefined

  const onlyMeta =
    chronological.length > 0 &&
    chronological.every(
      (step) =>
        step.kind === 'thinking' ||
        isGenericMetaStep(step) ||
        PHASE_ECHO.has(step.title.trim())
    )

  const hasActiveWork = chronological.some((step) => step.status === 'active')
  const allProcessDone =
    chronological.length > 0 && chronological.every((step) => step.status !== 'active')
  const hasToolOrNarration = chronological.some(
    (step) => step.kind === 'tool' || step.kind === 'narration'
  )

  // 仅在“过程已空闲 + 正文已开始流出”时切到生成回答，避免工具间隙误跳
  const generatingAnswer = Boolean(
    isStreaming && !hasActiveWork && allProcessDone && answerStreaming
  )

  // 工具/实质步骤完成后、尚未开始正文：显示「规划下一步」保持呼吸
  const lastVisibleTitle = (steps.at(-1)?.title || '').trim()
  const planningNext = Boolean(
    isStreaming &&
      allProcessDone &&
      shouldSynthesizePlanning({
        hasActiveWork,
        hasToolOrNarration,
        generatingAnswer,
        approvalWaiting,
        lastStepTitle: lastVisibleTitle
      })
  )

  // 还没有任何实质步骤时：顶部仍要有“思考中”占位，不能空白
  const showThinkingPlaceholder = Boolean(
    isStreaming &&
      !approvalWaiting &&
      !generatingAnswer &&
      !planningNext &&
      steps.length === 0 &&
      (chronological.length === 0 || onlyMeta)
  )

  const displaySteps = buildDisplaySteps({
    steps,
    isStreaming,
    approvalWaiting,
    generatingAnswer,
    planningNext,
    showThinkingPlaceholder
  })
  const showSteps = displaySteps.length > 0
  const lastDisplayStep = displaySteps[displaySteps.length - 1] || null
  const liveHead = buildLiveHead({
    steps: displaySteps,
    approvalWaiting,
    fallbackLabel: phaseModel.currentPhase
      ? PHASE_LIVE_LABEL[phaseModel.currentPhase]
      : '处理中'
  })
  const headStep = liveHead.step
  const activeDisplayStep = headStep

  // 直播头标签 = 当前展示步骤标题（与下方列表同源）
  const liveLabel = isStreaming ? liveHead.label : '处理中'

  let liveDetail: string | undefined
  if (isStreaming) {
    if (approvalWaiting) {
      liveDetail = liveHead.detail || '高危操作需要你确认后才能继续'
    } else if (headStep?.detail?.trim()) {
      liveDetail = headStep.detail
    } else if (headStep?.kind === 'tool') {
      liveDetail = '执行中…'
    } else if (showThinkingPlaceholder) {
      liveDetail = '分析任务并规划下一步…'
    } else if (planningNext) {
      liveDetail = '根据已完成步骤决定下一动作…'
    } else if (generatingAnswer) {
      liveDetail = '整理结果并输出…'
    } else if (phaseModel.currentPhase) {
      liveDetail =
        phaseModel.groups.find((g) => g.phase === phaseModel.currentPhase)?.summary ||
        '正在推进任务…'
    } else if (hasToolOrNarration) {
      // 已有实质步骤时不要跳回“连接模型…”，保持“还在推进/规划”的连续感
      liveDetail = planningNext
        ? '根据已完成步骤决定下一动作…'
        : '正在推进任务…'
    } else {
      liveDetail = '连接模型并准备下一步…'
    }
    if (!liveDetail?.trim()) {
      liveDetail = hasToolOrNarration ? '正在推进任务…' : '分析任务并规划下一步…'
    }
  }

  // 文案粘滞：同相位内 280ms 内不来回跳；真正阶段切换时带 swap 动画
  const rawLiveLabel = isStreaming ? liveLabel : '处理中'
  const rawLiveDetail = isStreaming ? liveDetail : undefined
  // hooks 必须在任何 early return 之前调用；layout 阶段同步，避免首帧先闪「处理中」
  useLayoutEffect(() => {
    if (!isStreaming) {
      if (stickyLive.label !== '处理中' || stickyLive.detail) {
        setStickyLive({ label: '处理中' })
      }
      lastSwapAtRef.current = 0
      if (stickyTimerRef.current) {
        clearTimeout(stickyTimerRef.current)
        stickyTimerRef.current = null
      }
      return
    }
    const nextLabel = rawLiveLabel
    const nextDetail = rawLiveDetail
    const same =
      stickyLive.label === nextLabel && (stickyLive.detail || '') === (nextDetail || '')
    if (same) return

    const nowMs = Date.now()
    const elapsed = nowMs - lastSwapAtRef.current
    const labelChanged = stickyLive.label !== nextLabel
    // 首次进入直播 / 尚未粘滞过：立即贴上真实头，避免 1 帧「处理中」空窗
    const firstPaint = lastSwapAtRef.current === 0
    if (!labelChanged && !firstPaint && elapsed < 280) {
      if (stickyTimerRef.current) clearTimeout(stickyTimerRef.current)
      stickyTimerRef.current = setTimeout(() => {
        setStickyLive({ label: nextLabel, detail: nextDetail })
        lastSwapAtRef.current = Date.now()
        stickyTimerRef.current = null
      }, 280 - elapsed)
      return
    }
    if (stickyTimerRef.current) {
      clearTimeout(stickyTimerRef.current)
      stickyTimerRef.current = null
    }
    setStickyLive({ label: nextLabel, detail: nextDetail })
    lastSwapAtRef.current = nowMs
  }, [isStreaming, rawLiveLabel, rawLiveDetail, stickyLive.label, stickyLive.detail])

  // 完成后若无可视步骤则不渲染；直播时即便还没步骤也要出呼吸头，避免“停住”
  // （粘滞 effect 已在上方无条件注册）
  if (!isStreaming && chronological.length === 0) return null
  if (!isStreaming && steps.length === 0) return null

  const displayLiveLabel = isStreaming ? stickyLive.label : '处理中'
  const displayLiveDetail = isStreaming ? stickyLive.detail : undefined
  const labelSwapKey = displayLiveLabel
  const detailSwapKey = displayLiveDetail || ''

  const doneCount = displaySteps.filter((step) => step.status !== 'active').length
  const progressCurrent =
    activeDisplayStep || generatingAnswer || planningNext || showThinkingPlaceholder
      ? doneCount + 1
      : doneCount
  const progressTotal = Math.max(
    displaySteps.length,
    progressCurrent,
    showThinkingPlaceholder ? 1 : 0
  )

  return (
    <div
      className={`turn-flow turn-flow--live ${isStreaming ? 'turn-flow--streaming' : ''}`}
      data-live={isStreaming ? 'true' : undefined}
      data-head-label={isStreaming ? displayLiveLabel : undefined}
      data-head-step={isStreaming ? (lastDisplayStep?.title || '') : undefined}
      role="region"
      aria-label="执行过程"
      aria-live="polite"
      aria-busy={isStreaming || undefined}
    >
      {isStreaming ? (
        <>
          <div className="turn-flow-live-head">
            <span className="turn-flow-live-orb-slot" aria-hidden>
              <span className="live-orb turn-flow-live-orb" />
            </span>
            <div className="turn-flow-live-copy">
              <span
                key={`lbl-${labelSwapKey}`}
                className="turn-flow-live-label turn-flow-live-label--swap"
                data-live-label={displayLiveLabel}
              >
                {displayLiveLabel}
              </span>
              {displayLiveDetail ? (
                <span
                  key={`dtl-${detailSwapKey}`}
                  className="turn-flow-live-detail turn-flow-live-detail--swap"
                  data-live-detail={displayLiveDetail}
                  title={displayLiveDetail}
                >
                  {displayLiveDetail}
                </span>
              ) : null}
            </div>
            <span className="turn-flow-live-time">{elapsed ?? '0s'}</span>
            {progressTotal > 0 ? (
              <span className="turn-flow-live-count" title="进度">
                {progressCurrent}/{progressTotal}
              </span>
            ) : null}
            {approvalWaiting ? (
              <span
                key="phase-approval"
                className="turn-flow-live-phase turn-flow-live-phase--wait-approval turn-flow-live-phase--swap"
                data-phase="approval"
              >
                审批
              </span>
            ) : generatingAnswer ? (
              <span
                key="phase-answer"
                className="turn-flow-live-phase turn-flow-live-phase--swap"
                data-phase="answer"
              >
                回答
              </span>
            ) : planningNext ? (
              <span
                key="phase-plan"
                className="turn-flow-live-phase turn-flow-live-phase--swap"
                data-phase="plan"
              >
                规划
              </span>
            ) : phaseModel.currentPhase ? (
              <span
                key={`phase-${phaseModel.currentPhase}`}
                className="turn-flow-live-phase turn-flow-live-phase--swap"
                data-phase={phaseModel.currentPhase}
              >
                {PHASE_LIVE_LABEL[phaseModel.currentPhase].replace(/中$/, '')}
              </span>
            ) : (
              <span
                key="phase-wait"
                className="turn-flow-live-phase turn-flow-live-phase--waiting turn-flow-live-phase--swap"
              >
                准备
              </span>
            )}
          </div>
          <ol className="turn-flow-phase-track" aria-label="执行阶段">
            {phaseModel.groups.map((group, index) => {
              const preparing =
                group.state === 'pending' &&
                !phaseModel.currentPhase &&
                index === phaseModel.groups.findIndex((g) => g.state === 'pending')
              return (
                <li
                  key={group.phase}
                  className={[
                    'turn-flow-phase-track-item',
                    `turn-flow-phase-track-item--${group.state}`,
                    phaseModel.currentPhase === group.phase
                      ? 'turn-flow-phase-track-item--current'
                      : '',
                    preparing ? 'turn-flow-phase-track-item--preparing' : ''
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span className="turn-flow-phase-track-dot" aria-hidden />
                  <span className="turn-flow-phase-track-label">{group.label}</span>
                </li>
              )
            })}
          </ol>
        </>
      ) : null}
      {isStreaming ? (
        <div
          className={`turn-flow-live-waiting ${
            showSteps && !generatingAnswer && !planningNext && !approvalWaiting
              ? 'turn-flow-live-waiting--subtle'
              : ''
          }`}
          aria-hidden
        >
          <span className="turn-flow-live-waiting-bar live-shimmer" />
          <span className="turn-flow-live-waiting-bar turn-flow-live-waiting-bar--mid live-shimmer" />
        </div>
      ) : null}
      {showSteps ? (
        <ol className="turn-flow-steps">
          {displaySteps.map((step, i) => (
            <ProcessStepRow
              key={step.id}
              step={step}
              isLast={i === displaySteps.length - 1}
            />
          ))}
        </ol>
      ) : null}
    </div>
  )
}
