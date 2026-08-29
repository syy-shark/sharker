/**
 * 一回合过程时间线（安静直播）：
 * - 思考：默认折叠成「思考中」（对标 Codex），点开才看旁白，避免顶着回答长高
 * - 闲聊/连接：一行状态字 + 耗时，无呼吸灯
 * - 有工具/旁白才展开时间线
 * - 正文上屏或回合结束后收成「工作中 / 工作了」（对标 Codex Worked for）；回答刚上屏时收回已展开的 Thought / Worked for
 * - 直播中不挂「查看输出」/ 退出码 / 进度摘要 / 秒表心跳 detail；秒表预留长回合宽度；工具间隙不把头闪成「规划下一步」
 * - 历史大段命令输出 / 思考按字节预算占位，点开再取全文（对标 Codex #38653）
 * - thinking 原文永不作为时间线标题或主回答
 * - 官方 MCP 单元格用 Calling / Called `server.tool(args)`，不把 JSON 结果倾进直播行（对标 Codex #20677，不抄 #22300）
 * - 官方 ImageView 过程行标题 Viewed Image，短结果不当摘要倾倒
 * @see src/ARCH.md · docs/ui-style.md
 */
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { LiveDuration } from './LiveDuration'
import type { TurnSegment } from '../../shared/types'
import {
  deriveChronologicalSteps,
  reuseProcessPhaseSteps,
  type ProcessPhaseStep
} from '../../shared/process-phases'
import {
  buildLiveHead,
  formatElapsedClock,
  liveThoughtBody,
  liveThinkingText,
  processElapsedSeconds,
  shouldCollapseProcessOnAnswerStart,
  shouldFoldTurnWork,
  shouldPromoteSyntheticLiveHead,
  shouldSynthesizePlanning,
  turnProcessBounds
} from '../../shared/live-display'
import { InlineDemo } from './InlineDemo'
import { ChatImage } from './ChatImage'
import { ChatLink } from './ChatLink'
import { isWorkspaceChatImageSrc } from '../../shared/chat-image'
import { isViewImageDump, isViewImageTool, viewedImagePathFromTool } from '../../shared/view-image'
import { parseWebSearchSources } from '../../shared/web-search'
import { parseUpdatePlanArgs } from '../../shared/update-plan'
import { isMcpActivityToolName, isMcpJsonDump } from '../../shared/mcp-activity'
import { isSubAgentInspectTool, subAgentIdFromTool } from '../../shared/subagent'
import {
  clipToolOutput,
  parseToolOutputDisplay,
  shouldExpandToolOutput,
  shouldMountToolExitCode,
  shouldMountToolOutputDetails,
  shouldMountToolResultSummary,
  shouldMountToolStepDetail,
  isToolProgressSummary,
  type ToolOutputDisplay
} from '../../shared/tool-output-display'
import { segmentHasDeferredOutput } from '../../shared/transcript-hydrate'
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
  /** 完整 thinking 原文（可来自未过滤的 live segments） */
  thinkText?: string
  /** 正文或内联演示已开始上屏：收起思考，避免和真内容抢位置 */
  contentStreaming?: boolean
  /** 正在生成内联演示（工具已启动，即使尚未可绘） */
  generatingDemo?: boolean
  /** 对标 Codex：主线程活动点开子 Agent */
  onOpenSubAgent?: (id: string | null) => void
  /** 对话里命令输出展示量 */
  toolOutputDisplay?: ToolOutputDisplay
  /** 点开瘦身后的命令输出时取完整消息 */
  messageId?: string
  onNeedFullMessage?: (messageId: string) => void
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

function isNoisyLiveDetail(label: string, detail?: string): boolean {
  const d = (detail || '').trim()
  const l = label.trim()
  if (!d) return true
  if (d === l) return true
  if (l.includes(d) || d.includes(l)) return true
  if (isToolProgressSummary(d)) return true
  return /分析任务|规划下一步|正在推进|连接模型|整理结果|处理中|思考中/.test(d)
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
      if (isGenericMetaStep(step)) return false
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
 * 最终展示用步骤列表。
 * 直播头取最后一项实质步骤，不把「规划下一步 / 生成回答中」顶上来闪头
 * （对标 Codex flashing thinking summaries）。无步骤的审批仍合成等待确认。
 */
function buildDisplaySteps(options: {
  steps: ProcessPhaseStep[]
  isStreaming: boolean
  approvalWaiting: boolean
  generatingAnswer: boolean
  planningNext: boolean
  showThinkingPlaceholder: boolean
}): DisplayStep[] {
  const { steps, isStreaming, approvalWaiting, showThinkingPlaceholder } = options

  if (!isStreaming) return steps.map(toDisplayStep)

  if (showThinkingPlaceholder) {
    return []
  }

  const display = steps.map(toDisplayStep)

  if (shouldPromoteSyntheticLiveHead('approval') && approvalWaiting && display.length === 0) {
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

function reuseDisplaySteps(prev: DisplayStep[], next: DisplayStep[]): DisplayStep[] {
  if (prev === next) return prev
  if (!prev.length) return next
  const out: DisplayStep[] = []
  const shared = Math.min(prev.length, next.length)
  for (let i = 0; i < shared; i++) {
    const a = prev[i]!
    const b = next[i]!
    if (
      a.id === b.id &&
      a.title === b.title &&
      a.detail === b.detail &&
      a.status === b.status &&
      a.kind === b.kind &&
      a.source === b.source
    ) {
      out.push(a)
    } else {
      out.push(b)
    }
  }
  if (next.length > prev.length) out.push(...next.slice(prev.length))
  return out
}

export function ThoughtDisclosure({
  text,
  open,
  onToggle,
  label,
  elapsed,
  streaming = false,
  deferred = false,
  loading = false
}: {
  text: string
  open: boolean
  onToggle: () => void
  label: string
  elapsed?: ReactNode
  streaming?: boolean
  deferred?: boolean
  loading?: boolean
}) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const body = liveThoughtBody(text)
  useLayoutEffect(() => {
    if (!open || !streaming) return
    const el = bodyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [open, streaming, body])

  if (!text.trim() && !streaming && !deferred) return null

  return (
    <div
      className={[
        'turn-flow-thought',
        open ? 'turn-flow-thought--open' : '',
        streaming ? 'turn-flow-thought--live' : ''
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        className="turn-flow-thought-toggle"
        onClick={onToggle}
        aria-expanded={open}
      >
        <ChevronDown
          size={13}
          className={`turn-flow-thought-chevron ${open ? 'is-open' : ''}`}
          aria-hidden
        />
        <span
          className={
            streaming && (open || !body) ? 'turn-flow-thought-label live-text-shimmer' : 'turn-flow-thought-label'
          }
        >
          {label}
        </span>
        {elapsed ? <span className="turn-flow-thought-time">{elapsed}</span> : null}
      </button>
      {open && (body || loading) ? (
        <div ref={bodyRef} className="turn-flow-thought-body" aria-label="思考过程">
          {loading && !body ? (
            <p className="turn-flow-output-deferred">正在载入思考…</p>
          ) : (
            <div className="turn-flow-thought-text">{body}</div>
          )}
        </div>
      ) : null}
    </div>
  )
}

function toolOutputSummaryLabel(clipped: boolean, deferred: boolean): string {
  if (deferred) return '查看输出'
  return clipped ? '查看输出（已截断）' : '查看输出'
}

function ToolOutputDetails({
  segment,
  outputMode,
  status,
  isStreaming = false,
  messageId,
  onNeedFullMessage
}: {
  segment: TurnSegment
  outputMode: ToolOutputDisplay
  status: string
  isStreaming?: boolean
  messageId?: string
  onNeedFullMessage?: (messageId: string) => void
}) {
  const deferred = segmentHasDeferredOutput(segment)
  const clip = clipToolOutput(segment.resultOutput || '', outputMode)
  const [open, setOpen] = useState(() =>
    shouldExpandToolOutput(outputMode, status, { isStreaming })
  )
  const requestedRef = useRef(false)

  useEffect(() => {
    if (!open || !deferred || !messageId || !onNeedFullMessage || requestedRef.current) return
    requestedRef.current = true
    onNeedFullMessage(messageId)
  }, [open, deferred, messageId, onNeedFullMessage])

  return (
    <details
      className="turn-flow-step-output"
      open={open}
      onToggle={(event) => {
        setOpen(event.currentTarget.open)
      }}
    >
      <summary>{toolOutputSummaryLabel(clip.clipped, deferred)}</summary>
      {open ? (
        deferred && !segment.resultOutput ? (
          <p className="turn-flow-output-deferred">正在载入完整输出…</p>
        ) : (
          <pre>{clip.text}</pre>
        )
      ) : null}
    </details>
  )
}

function WorkedDisclosure({
  open,
  onToggle,
  streaming,
  clock
}: {
  open: boolean
  onToggle: () => void
  streaming: boolean
  clock: ReactNode
}) {
  return (
    <div className={`turn-flow-worked${streaming ? ' turn-flow-worked--live' : ''}`}>
      <button
        type="button"
        className="turn-flow-thought-toggle"
        onClick={onToggle}
        aria-expanded={open}
      >
        <ChevronDown
          size={13}
          className={`turn-flow-thought-chevron ${open ? 'is-open' : ''}`}
          aria-hidden
        />
        <span
          className={
            streaming ? 'turn-flow-thought-label live-text-shimmer' : 'turn-flow-thought-label'
          }
        >
          {streaming ? '工作中' : '工作了'}
        </span>
        <span className="turn-flow-thought-time">{clock}</span>
      </button>
    </div>
  )
}

const ProcessStepRow = memo(function ProcessStepRow({
  step,
  isLast,
  onOpenSubAgent,
  outputMode,
  isStreaming = false,
  messageId,
  onNeedFullMessage
}: {
  step: DisplayStep
  isLast: boolean
  onOpenSubAgent?: (id: string | null) => void
  outputMode: ToolOutputDisplay
  isStreaming?: boolean
  messageId?: string
  onNeedFullMessage?: (messageId: string) => void
}) {
  const segment = step.source?.segment
  const isDemo =
    Boolean(segment?.toolName === 'present_inline_demo' && segment?.content?.trim())
  const viewedImagePath =
    step.status === 'done' && segment?.toolName
      ? viewedImagePathFromTool(segment.toolName, segment.resultOutput || '')
      : null
  const viewedImageSrc =
    viewedImagePath && isWorkspaceChatImageSrc(viewedImagePath) ? viewedImagePath : null
  const webSources =
    step.status === 'done' && segment?.toolName === 'web_search'
      ? parseWebSearchSources(segment.resultOutput || '')
      : []
  const updatePlan =
    segment?.toolName === 'update_plan' ? parseUpdatePlanArgs(segment.toolArgs) : null
  const mcpActivity = Boolean(segment?.toolName && isMcpActivityToolName(segment.toolName))
  const viewImageActivity = Boolean(segment?.toolName && isViewImageTool(segment.toolName))
  const title = step.title
  const subAgentId = subAgentIdFromTool(
    segment?.toolName,
    segment?.toolArgs,
    segment?.resultSummary,
    segment?.resultOutput,
    segment?.content,
    segment?.toolDetail,
    step.detail
  )
  const openable = Boolean(onOpenSubAgent && isSubAgentInspectTool(segment?.toolName))

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
          {openable ? (
            <button
              type="button"
              className="turn-flow-step-open"
              onClick={() => onOpenSubAgent?.(subAgentId)}
              aria-label={subAgentId ? `打开子 Agent ${subAgentId}` : '打开子 Agent 活动'}
            >
              <span className="turn-flow-step-title">{title}</span>
              <span className="turn-flow-step-open-hint">打开</span>
            </button>
          ) : (
            <span className="turn-flow-step-title">{title}</span>
          )}
          {shouldMountToolStepDetail({
            detail: step.detail,
            title,
            isStreaming
          }) && !isDemo && !updatePlan?.plan.length && !mcpActivity ? (
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
        {updatePlan && updatePlan.plan.length > 0 ? (
          <div className="turn-flow-plan">
            {updatePlan.explanation ? (
              <p className="turn-flow-plan-note">{updatePlan.explanation}</p>
            ) : null}
            <ol className="turn-flow-plan-list">
              {updatePlan.plan.map((item, index) => (
                <li
                  key={`${index}:${item.step}`}
                  className={`turn-flow-plan-item turn-flow-plan-item--${item.status}`}
                >
                  <span className="turn-flow-plan-mark" aria-hidden>
                    {item.status === 'completed' ? '✓' : item.status === 'in_progress' ? '→' : '○'}
                  </span>
                  <span className="turn-flow-plan-step">{item.step}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
        {shouldMountToolResultSummary({
          summary: segment?.resultSummary,
          detail: step.detail,
          status: step.status,
          isStreaming,
          isDemo:
            isDemo ||
            Boolean(updatePlan?.plan.length) ||
            mcpActivity ||
            viewImageActivity ||
            isMcpJsonDump(segment?.resultSummary) ||
            isViewImageDump(segment?.resultSummary)
        }) ? (
          <span className="turn-flow-step-result">{segment?.resultSummary}</span>
        ) : null}
        {shouldMountToolExitCode({
          exitCode: segment?.exitCode,
          isStreaming
        }) ? (
          <span
            className={`turn-flow-step-exit ${
              Number(segment?.exitCode) === 0
                ? 'turn-flow-step-exit--ok'
                : 'turn-flow-step-exit--err'
            }`}
          >
            退出码 {segment?.exitCode}
          </span>
        ) : null}
        {step.status === 'error' ? (
          <span className="turn-flow-step-error">{segment?.errorMessage || '操作失败'}</span>
        ) : null}
        {viewedImageSrc ? (
          <div className="turn-flow-image-view">
            <ChatImage
              src={viewedImageSrc}
              alt="Viewed image"
              filePath={viewedImageSrc}
              name={viewedImageSrc.replace(/\\/g, '/').split('/').pop()}
            />
          </div>
        ) : null}
        {webSources.length > 0 ? (
          <ul className="turn-flow-web-sources">
            {webSources.map((source) => (
              <li key={source.url} className="turn-flow-web-source">
                <ChatLink href={source.url} title={source.title}>
                  {source.title}
                </ChatLink>
              </li>
            ))}
          </ul>
        ) : null}
        {shouldMountToolOutputDetails({
          mode: outputMode,
          hasDistinctOutput: Boolean(
            !isDemo &&
              !viewedImageSrc &&
              webSources.length === 0 &&
              !updatePlan?.plan.length &&
              !mcpActivity &&
              !viewImageActivity &&
              ((segment?.resultOutput && segment.resultOutput !== segment.resultSummary) ||
                (segment && segmentHasDeferredOutput(segment)))
          ),
          isStreaming
        }) && segment ? (
          <ToolOutputDetails
            segment={segment}
            outputMode={outputMode}
            status={step.status}
            isStreaming={isStreaming}
            messageId={messageId}
            onNeedFullMessage={onNeedFullMessage}
          />
        ) : null}
      </div>
    </li>
  )
})

/** 按先后顺序渲染过程；正文上屏后把步骤收进 Worked for，避免顶着回答长高。 */
export const TurnFlow = memo(function TurnFlow({
  segments,
  isStreaming = false,
  liveStartedAt,
  includeFinalText: _includeFinalText = false,
  approvalWaiting = false,
  answerStreaming = false,
  thinkText,
  contentStreaming = false,
  generatingDemo = false,
  onOpenSubAgent,
  toolOutputDisplay,
  messageId,
  onNeedFullMessage
}: Props) {
  const outputMode = parseToolOutputDisplay(toolOutputDisplay)
  /** 直播头文案短时粘滞，避免工具/规划/回答边界抖动 */
  const [stickyLive, setStickyLive] = useState<{ label: string; detail?: string }>({
    label: '思考中'
  })
  const stickyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSwapAtRef = useRef(0)
  const [thoughtOpen, setThoughtOpen] = useState(false)
  const userThoughtRef = useRef(false)
  const [workedOpen, setWorkedOpen] = useState(false)
  const userWorkedRef = useRef(false)
  const wasContentStreamingRef = useRef(contentStreaming)
  useEffect(() => {
    return () => {
      if (stickyTimerRef.current) clearTimeout(stickyTimerRef.current)
    }
  }, [])
  useEffect(() => {
    if (
      shouldCollapseProcessOnAnswerStart(contentStreaming, wasContentStreamingRef.current)
    ) {
      userWorkedRef.current = false
      setWorkedOpen(false)
      userThoughtRef.current = false
      setThoughtOpen(false)
    }
    wasContentStreamingRef.current = contentStreaming
  }, [contentStreaming])

  const chronologicalRef = useRef<ProcessPhaseStep[]>([])
  const chronological = useMemo(() => {
    const next = reuseProcessPhaseSteps(
      chronologicalRef.current,
      deriveChronologicalSteps(segments, { isStreaming })
    )
    chronologicalRef.current = next
    return next
  }, [isStreaming, segments])
  const steps = useMemo(
    () => visibleSteps(chronological, isStreaming),
    [chronological, isStreaming]
  )

  const fallbackStartedAt =
    liveStartedAt ??
    chronological.find((step) => step.segment.startedAt != null)?.segment.startedAt ??
    chronological[0]?.segment.startedAt
  const liveClock =
    isStreaming && fallbackStartedAt != null ? (
      <LiveDuration startedAt={fallbackStartedAt} />
    ) : undefined

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

  // 工具/实质步骤完成后、尚未开始正文：显示「规划下一步」保持存活感
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
      !generatingDemo &&
      !contentStreaming &&
      !planningNext &&
      steps.length === 0 &&
      (chronological.length === 0 || onlyMeta)
  )

  const rawThinkText = thinkText ?? liveThinkingText(segments)
  const thoughtBody = liveThoughtBody(rawThinkText)
  const hasThought = Boolean(thoughtBody)
  const thoughtBusy = Boolean(
    isStreaming &&
      !approvalWaiting &&
      !generatingAnswer &&
      !generatingDemo &&
      !hasToolOrNarration &&
      !contentStreaming &&
      !planningNext
  )
  // 对标 Codex：思考默认折叠成一条「思考中」，不把增长正文顶在回答上面造成贴底跳动。
  const thoughtExpanded = userThoughtRef.current ? thoughtOpen : false

  const displayStepsRef = useRef<DisplayStep[]>([])
  const displaySteps = reuseDisplaySteps(
    displayStepsRef.current,
    buildDisplaySteps({
      steps,
      isStreaming,
      approvalWaiting,
      generatingAnswer,
      planningNext,
      showThinkingPlaceholder
    })
  )
  displayStepsRef.current = displaySteps
  const lastDisplayStep = displaySteps[displaySteps.length - 1] || null
  const liveHead = buildLiveHead({
    steps: displaySteps,
    approvalWaiting,
    fallbackLabel: approvalWaiting
      ? '等待确认'
      : generatingAnswer
        ? '生成回答中'
        : generatingDemo
          ? '生成演示'
          : planningNext
            ? '规划下一步'
            : '思考中'
  })
  const headStep = liveHead.step

  const liveLabel = isStreaming ? liveHead.label : '处理中'

  let liveDetail: string | undefined
  if (isStreaming) {
    if (approvalWaiting) {
      liveDetail = liveHead.detail || '需要确认后继续'
    } else if (headStep?.kind === 'tool' && headStep.detail?.trim()) {
      liveDetail = headStep.detail
    } else if (headStep?.kind === 'narration' && headStep.detail?.trim()) {
      liveDetail = headStep.detail
    }
  }
  if (liveDetail && isNoisyLiveDetail(liveLabel, liveDetail)) {
    liveDetail = undefined
  }

  // 文案粘滞：同相位内 280ms 内不来回跳；真正阶段切换时带 swap 动画
  const rawLiveLabel = isStreaming ? liveLabel : '处理中'
  const rawLiveDetail = isStreaming ? liveDetail : undefined
  // hooks 必须在任何 early return 之前调用；layout 阶段同步，避免首帧先闪「处理中」
  useLayoutEffect(() => {
    if (!isStreaming) {
      if (stickyLive.label !== '思考中' || stickyLive.detail) {
        setStickyLive({ label: '思考中' })
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

  // 完成后若无可视步骤则不渲染；直播时即便还没步骤也要出状态行，避免“停住”
  // （粘滞 effect 已在上方无条件注册）
  if (!isStreaming && chronological.length === 0) return null
  if (!isStreaming && steps.length === 0) return null

  const displayLiveLabel = isStreaming ? stickyLive.label : '处理中'
  const displayLiveDetail = isStreaming ? stickyLive.detail : undefined
  const listSteps = displaySteps.filter(
    (s) =>
      s.kind === 'tool' ||
      s.kind === 'narration' ||
      s.status === 'error' ||
      Boolean(s.source?.segment.approval)
  )
  const thoughtAsLiveHead = Boolean(isStreaming && thoughtBusy && hasThought)
  const pinnedSteps = listSteps.filter(
    (step) => step.status === 'error' || Boolean(step.source?.segment.approval)
  )
  const foldableSteps = listSteps.filter(
    (step) => step.status !== 'error' && !step.source?.segment.approval
  )
  const showWorkedChip = shouldFoldTurnWork({
    contentStreaming,
    isStreaming,
    foldableStepCount: foldableSteps.length
  })
  const workedExpanded = userWorkedRef.current ? workedOpen : false
  const showStepList = listSteps.length > 0 && (!showWorkedChip || workedExpanded)
  const showPinnedSteps = pinnedSteps.length > 0 && !showStepList
  const processBounds = turnProcessBounds(segments)
  const workedStartedAt = fallbackStartedAt ?? processBounds.startedAt
  const workedClock = isStreaming ? (
    <LiveDuration startedAt={workedStartedAt} />
  ) : (
    formatElapsedClock(
      processElapsedSeconds({ startedAt: workedStartedAt, endedAt: processBounds.endedAt })
    )
  )
  const showLiveHead = Boolean(
    isStreaming &&
      !thoughtAsLiveHead &&
      !showWorkedChip &&
      (!contentStreaming || listSteps.length > 0 || approvalWaiting)
  )
  const showThought = Boolean(hasThought && isStreaming)

  return (
    <div
      className={`turn-flow turn-flow--live${isStreaming ? ' turn-flow--streaming' : ''}${
        contentStreaming ? ' turn-flow--answer-out' : ''
      }`}
      data-live={isStreaming ? 'true' : undefined}
      data-head-label={isStreaming ? displayLiveLabel : undefined}
      data-head-step={isStreaming ? (lastDisplayStep?.title || '') : undefined}
      role="region"
      aria-label="执行过程"
      aria-live="polite"
      aria-busy={isStreaming || undefined}
    >
      {showThought ? (
        <ThoughtDisclosure
          text={rawThinkText}
          open={thoughtExpanded}
          onToggle={() => {
            userThoughtRef.current = true
            setThoughtOpen(!thoughtExpanded)
          }}
          label={thoughtAsLiveHead ? '思考中' : '已思考'}
          elapsed={thoughtAsLiveHead ? liveClock : undefined}
          streaming={thoughtAsLiveHead}
        />
      ) : null}
      {showLiveHead ? (
        <div className="turn-flow-live-head">
          <div className="turn-flow-live-copy">
            <span
              className="turn-flow-live-label live-text-shimmer"
              data-live-label={displayLiveLabel}
            >
              {displayLiveLabel}
            </span>
            {displayLiveDetail ? (
              <span
                className="turn-flow-live-detail"
                data-live-detail={displayLiveDetail}
                title={displayLiveDetail}
              >
                {displayLiveDetail}
              </span>
            ) : null}
          </div>
          <span className="turn-flow-live-time">{liveClock ?? '0s'}</span>
          {approvalWaiting ? (
            <span
              className="turn-flow-live-phase turn-flow-live-phase--wait-approval"
              data-phase="approval"
            >
              审批
            </span>
          ) : null}
        </div>
      ) : null}
      {showWorkedChip ? (
        <WorkedDisclosure
          open={workedExpanded}
          onToggle={() => {
            userWorkedRef.current = true
            setWorkedOpen(!workedExpanded)
          }}
          streaming={isStreaming}
          clock={workedClock}
        />
      ) : null}
      {showStepList ? (
        <ol className="turn-flow-steps">
          {listSteps.map((step, i) => (
            <ProcessStepRow
              key={step.id}
              step={step}
              isLast={i === listSteps.length - 1}
              onOpenSubAgent={onOpenSubAgent}
              outputMode={outputMode}
              isStreaming={isStreaming}
              messageId={messageId}
              onNeedFullMessage={onNeedFullMessage}
            />
          ))}
        </ol>
      ) : null}
      {showPinnedSteps ? (
        <ol className="turn-flow-steps">
          {pinnedSteps.map((step, i) => (
            <ProcessStepRow
              key={step.id}
              step={step}
              isLast={i === pinnedSteps.length - 1}
              onOpenSubAgent={onOpenSubAgent}
              outputMode={outputMode}
              isStreaming={isStreaming}
              messageId={messageId}
              onNeedFullMessage={onNeedFullMessage}
            />
          ))}
        </ol>
      ) : null}
    </div>
  )
})
