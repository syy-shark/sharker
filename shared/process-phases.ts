/**
 * 将 TurnSegment 纯派生为前端执行阶段，不改变持久化契约。
 * @see shared/ARCH.md
 */
import type { TurnSegment } from './types'
import { formatEditActivity, isEditActivityToolName } from './edit-activity'
import { formatExecActivity, summarizeExecCommand } from './exec-activity'
import {
  exploreNameFromPath,
  formatExploreActivity,
  isExploreActivityToolName
} from './explore-activity'
import { formatMcpActivity, isMcpActivityToolName, isMcpJsonDump } from './mcp-activity'
import { isToolProgressSummary } from './tool-output-display'
import { formatUpdatePlanActivity } from './update-plan'

function findLast<T>(items: T[], pred: (item: T) => boolean): T | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]
    if (item && pred(item)) return item
  }
  return undefined
}

export type ProcessPhase = 'understand' | 'explore' | 'execute' | 'verify'
export type ProcessPhaseState = 'pending' | 'active' | 'done' | 'error' | 'cancelled'
export type ProcessPhaseStepKind = 'thinking' | 'status' | 'narration' | 'tool'

export interface ProcessPhaseStep {
  id: string
  phase: ProcessPhase
  kind: ProcessPhaseStepKind
  title: string
  detail?: string
  status: Exclude<ProcessPhaseState, 'pending'>
  segment: TurnSegment
}

export interface ProcessPhaseGroup {
  phase: ProcessPhase
  label: string
  summary: string
  state: ProcessPhaseState
  steps: ProcessPhaseStep[]
}

export interface ProcessPhaseModel {
  groups: ProcessPhaseGroup[]
  currentPhase?: ProcessPhase
  totals: {
    readFiles: number
    modifiedFiles: number
    commands: number
    verifications: number
  }
}

export const PROCESS_PHASE_ORDER: readonly ProcessPhase[] = [
  'understand',
  'explore',
  'execute',
  'verify'
]

const PHASE_LABELS: Record<ProcessPhase, string> = {
  understand: '理解',
  explore: '探索',
  execute: '执行',
  verify: '验证'
}

const UNDERSTAND_TOOLS = new Set(['compress', 'enter_plan_mode', 'exit_plan_mode'])

const EXPLORE_TOOLS = new Set([
  'read_file',
  'read_image',
  'view_image',
  'read_pdf',
  'read_notebook',
  'read_graph',
  'list_dir',
  'glob_file_search',
  'grep',
  'git_status',
  'git_diff',
  'git_log',
  'git_show',
  'read_thread_terminal',
  'web_fetch',
  'web_search',
  'open_url',
  'mcp_list_tools',
  'present_inline_demo',
  'task_list',
  'task_get',
  'task_output',
  'agent_list',
  'agent_get_result',
  'desktop_doctor',
  'desktop_screenshot',
  'desktop_list_windows',
  'desktop_get_ui_tree',
  'browser_navigate',
  'browser_snapshot',
  'browser_screenshot',
  'browser_close'
])

const EDIT_TOOLS = new Set([
  'write_file',
  'search_replace',
  'apply_patch',
  'edit_notebook',
  'delete_path',
  'move_path',
  'create_directory'
])

const COMMAND_TOOLS = new Set([
  'run_terminal_cmd',
  'run_background_shell',
  'shell_send_input'
])

const VERIFY_COMMAND =
  /(?:^|\s)(?:(?:npm|pnpm|yarn|bun)(?:\.cmd)?\s+(?:run\s+)?(?:test|build|lint|typecheck|check)|pytest|vitest|jest|tsc|eslint|cargo\s+(?:test|check|clippy|build)|go\s+test|dotnet\s+(?:test|build)|mvn\s+test|gradlew?\s+test)(?:\s|$)/i

const VERIFY_TEXT = /验证|校验|检查|测试|构建|编译|lint|typecheck|verify|validate|test|build/i
const EXPLORE_TEXT = /读取|浏览|搜索|查找|定位|分析项目|检查现状|read|search|inspect|explor/i
const EXECUTE_TEXT = /修改|编辑|写入|创建|删除|移动|执行|运行|应用补丁|implement|edit|write|run/i

function cleanInlineText(value: string | undefined, max = 96): string | undefined {
  if (!value) return undefined
  const clean = value
    .replace(/```[\s\S]*?```/g, '代码片段')
    // 保留连字符与下划线（rm -rf / STOP_TEST），只清理 markdown 符号
    .replace(/[`*>#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!clean) return undefined
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

function classifyTool(segment: TurnSegment): ProcessPhase {
  const name = segment.toolName ?? ''
  const detail = segment.toolDetail ?? ''

  if (segment.isVerification) return 'verify'
  if (UNDERSTAND_TOOLS.has(name)) return 'understand'
  if (name === 'verify_removal' || /(?:verify|validate|test|check)/i.test(name)) return 'verify'
  if (COMMAND_TOOLS.has(name) && VERIFY_COMMAND.test(detail)) return 'verify'
  if (EXPLORE_TOOLS.has(name)) return 'explore'
  if (EDIT_TOOLS.has(name)) return 'execute'

  // 用末尾动作词补足未知工具的展示归类。
  if (/(?:^|__)(?:read|search|list|get|snapshot|screenshot|inspect)(?:_|$)/i.test(name)) {
    return 'explore'
  }
  if (/(?:^|__)(?:verify|validate|test|check)(?:_|$)/i.test(name)) return 'verify'
  return 'execute'
}

function classifyContent(content: string | undefined, fallback: ProcessPhase): ProcessPhase {
  const text = content ?? ''
  if (VERIFY_TEXT.test(text)) return 'verify'
  if (EXPLORE_TEXT.test(text)) return 'explore'
  if (EXECUTE_TEXT.test(text)) return 'execute'
  return fallback
}

/** shell 命令摘要：保留 -rf 等短选项，不取路径末段误伤命令 */
function commandSummaryFromDetail(detail: string | undefined): string | undefined {
  return summarizeExecCommand(detail)
}

function stepTitle(segment: TurnSegment, phase: ProcessPhase): string {
  if (segment.kind === 'thinking') return '分析任务目标与约束'
  if (segment.kind === 'tool') {
    const base = segment.toolTitle ?? segment.toolName ?? '执行操作'
    const tool = segment.toolName || ''
    if (isExploreActivityToolName(tool)) {
      return formatExploreActivity(tool, segment.toolArgs, segment.toolDetail) ?? base
    }
    if (isEditActivityToolName(tool)) {
      const fileCount = Math.max(
        segment.editPreview?.length ?? 0,
        segment.fileDiffs?.length ?? 0,
        segment.fileDiff ? 1 : 0
      )
      return (
        formatEditActivity(tool, segment.toolArgs, segment.toolDetail, segment.status, fileCount) ??
        base
      )
    }
    if (tool === 'update_plan') {
      return formatUpdatePlanActivity(segment.toolArgs, segment.status)
    }
    if (tool === 'web_search') {
      const query =
        typeof segment.toolArgs?.query === 'string' ? segment.toolArgs.query.trim() : ''
      if (segment.status === 'active') return 'Searching the web'
      return query ? `Searched the web for ${query}` : 'Searched the web'
    }
    if (isMcpActivityToolName(tool)) {
      return formatMcpActivity(tool, segment.toolArgs, segment.status) ?? base
    }
    if (tool === 'run_terminal_cmd') {
      const fromArgs =
        typeof segment.toolArgs?.command === 'string' ? segment.toolArgs.command : undefined
      const detailCandidate = segment.toolDetail
      const raw =
        fromArgs ||
        (!isToolProgressSummary(detailCandidate) ? detailCandidate : undefined)
      if (raw && !/^(已启动|执行中|运行中|处理中)/.test(raw.trim())) {
        return formatExecActivity(raw, segment.status)
      }
      return formatExecActivity(undefined, segment.status)
    }
    return base
  }
  if (segment.kind === 'status') {
    const cleaned = cleanInlineText(segment.content)
    // 源码/JSON 行不当步骤标题
    if (cleaned && /^(L\d+:|[{}\[\]]|```)/.test(cleaned)) {
      return phaseActiveLabel(phase)
    }
    // 规划/准备类状态压缩成稳定短标题，方便直播头同步
    if (cleaned && /规划下一步|决定下一动作|规划中/.test(cleaned)) return '规划下一步'
    if (cleaned && /正在准备读取/.test(cleaned)) return '正在准备读取文件'
    if (cleaned && /正在准备运行|正在准备命令/.test(cleaned)) return '正在准备运行命令'
    if (cleaned && /正在准备列出|正在准备目录|正在准备浏览/.test(cleaned)) return '正在准备列出目录'
    if (cleaned && /正在准备写入|正在准备修改|正在整理.*修改|正在生成.*写入/.test(cleaned))
      return '正在准备修改文件'
    if (cleaned && /正在准备/.test(cleaned)) {
      // 其余准备态：保留短文案，避免直播头被长句拖住
      return cleaned.length > 18 ? `${cleaned.slice(0, 18)}…` : cleaned
    }
    return cleaned ?? phaseActiveLabel(phase)
  }
  return cleanInlineText(segment.content) ?? '整理阶段结果'
}

function phaseActiveLabel(phase: ProcessPhase): string {
  switch (phase) {
    case 'understand':
      return '分析任务目标与约束'
    case 'explore':
      return '探索项目上下文'
    case 'execute':
      return '执行任务修改'
    case 'verify':
      return '验证执行结果'
  }
}

function fileNamesForStep(step: ProcessPhaseStep): string[] {
  const segment = step.segment
  const names: string[] = []
  const diffs = segment.fileDiffs ?? (segment.fileDiff ? [segment.fileDiff] : [])
  for (const diff of diffs) names.push(diff.path)
  for (const preview of segment.editPreview ?? []) names.push(preview.path)

  if (names.length === 0 && segment.toolDetail && segment.toolName) {
    if (EDIT_TOOLS.has(segment.toolName) || segment.toolName === 'read_file') {
      names.push(segment.toolDetail)
    }
  }
  return names.map((name) => name.trim().replace(/\\/g, '/')).filter(Boolean)
}

function groupSummary(phase: ProcessPhase, steps: ProcessPhaseStep[]): string {
  if (steps.length === 0) {
    if (phase === 'understand') return '等待分析'
    if (phase === 'explore') return '等待探索'
    if (phase === 'execute') return '等待执行'
    return '等待验证'
  }

  const active = steps.find((step) => step.status === 'active')
  if (active) return active.title
  if (steps.some((step) => step.status === 'error')) {
    return phase === 'verify' ? '验证遇到问题' : '阶段执行遇到问题'
  }

  const files = new Set(steps.flatMap(fileNamesForStep))
  if (phase === 'understand') return '任务与约束已梳理'
  if (phase === 'explore') {
    return files.size > 0 ? `浏览 ${files.size} 个文件` : `完成 ${steps.length} 项探索`
  }
  if (phase === 'execute') {
    return files.size > 0 ? `修改 ${files.size} 个文件` : `完成 ${steps.length} 项执行`
  }
  return '验证完成'
}

function normalizeText(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function isDuplicateOfFinalText(content: string | undefined, finalContent: string): boolean {
  const c = normalizeText(content)
  const f = normalizeText(finalContent)
  if (!c || !f) return false
  if (c === f) return true
  if (f.startsWith(c) && c.length >= 12) return true
  if (c.startsWith(f) && f.length >= 12) return true
  return false
}

function sourceSegments(segments: TurnSegment[], isStreaming: boolean): TurnSegment[] {
  let source = segments.filter((segment) => !(segment.kind === 'text' && segment.role === 'final'))
  if (isStreaming) {
    const last = source[source.length - 1]
    // 末尾 active text 是正在生成的最终回答，不重复放进执行轨道。
    if (last?.kind === 'text' && last.status === 'active') source = source.slice(0, -1)
    // 工具仍在跑时：已闭合的旁白若将被当作 final 展示，过程区先不放，避免双份
    const hasActiveWork = segments.some(
      (s) =>
        s.status === 'active' &&
        (s.kind === 'tool' || s.kind === 'thinking' || s.kind === 'status')
    )
    if (hasActiveWork) {
      // 保留中途旁白，但与「当前即将作为 final 的文本」相同的除外
      const trailingText = findLast(segments, (s) => s.kind === 'text' && Boolean(s.content?.trim()))
      const trail = normalizeText(trailingText?.content)
      if (trail) {
        source = source.filter(
          (s) => !(s.kind === 'text' && isDuplicateOfFinalText(s.content, trail) && s.status === 'done')
        )
      }
    }
  } else {
    // 结束后：去掉与 final 正文重复的旁白
    const finalSeg = findLast(segments, (s) => s.kind === 'text' && s.role === 'final')
    const finalText =
      normalizeText(finalSeg?.content) ||
      normalizeText(findLast(segments, (s) => s.kind === 'text')?.content)
    if (finalText) {
      source = source.filter(
        (s) => !(s.kind === 'text' && isDuplicateOfFinalText(s.content, finalText))
      )
    }
  }
  return source
}

/** 将源片段转为步骤列表（时间序）；不暴露 thinking 原文。 */
function buildStepsFromSource(
  source: TurnSegment[],
  isStreaming: boolean
): ProcessPhaseStep[] {
  let fallbackPhase: ProcessPhase = 'understand'
  const steps: ProcessPhaseStep[] = []

  for (const segment of source) {
    let phase: ProcessPhase
    if (segment.kind === 'thinking') {
      phase = 'understand'
    } else if (segment.kind === 'tool') {
      phase = classifyTool(segment)
    } else if (segment.toolName) {
      phase = classifyTool(segment)
    } else {
      phase = classifyContent(segment.content, fallbackPhase)
    }

    if (segment.kind !== 'thinking') fallbackPhase = phase
    // 尊重片段自身 status：流式时允许多个已完成步骤 + 一个 active，
    // 不要只因“不是 lastActive”就把工具步骤误标 done 后还让 seed 独占 active。
    const status: ProcessPhaseStep['status'] =
      segment.status === 'error'
        ? 'error'
        : segment.status === 'active'
          ? 'active'
          : segment.status === 'cancelled'
            ? 'cancelled'
            : 'done'

    const title = stepTitle(segment, phase)
    let detail =
      segment.kind === 'tool' && segment.toolName !== 'present_inline_demo'
        ? cleanInlineText(
            (() => {
              const summary = segment.resultSummary?.trim()
              const toolDetail = segment.toolDetail
              const progressLike = Boolean(summary) && isToolProgressSummary(summary)
              const stableDetail =
                toolDetail && !isToolProgressSummary(toolDetail) ? toolDetail : undefined
              // 秒表心跳只走预留宽时钟，不进过程行 / 直播头（对标 Codex #19260）
              if (progressLike || summary === '已停止') {
                if (summary === '已停止') return '已停止'
                return stableDetail
              }
              // 直播中：真正状态字（如「通过 12 个测试」）可以上 detail
              if (
                segment.status === 'active' &&
                summary &&
                !/^(L\d+:|[{}\[\]]|```)/.test(summary) &&
                !isMcpJsonDump(summary)
              ) {
                return summary
              }
              if (isMcpActivityToolName(segment.toolName || '') && isMcpJsonDump(stableDetail || summary)) {
                return undefined
              }
              return stableDetail || summary
            })(),
            120
          )
        : segment.kind === 'tool' && segment.toolName === 'present_inline_demo'
          ? cleanInlineText(segment.toolDetail, 80)
          : undefined
    // 标题已含 path/command 时不再重复 detail（直播中也不另起一行顶过程区）
    if (detail && segment.kind === 'tool' && title.includes(detail)) {
      detail = segment.resultSummary?.trim() === '已停止' ? '已停止' : undefined
    }
    if (
      detail &&
      segment.kind === 'tool' &&
      (isExploreActivityToolName(segment.toolName || '') ||
        isEditActivityToolName(segment.toolName || ''))
    ) {
      const leaf =
        exploreNameFromPath(segment.toolDetail) ||
        exploreNameFromPath(
          typeof segment.toolArgs?.path === 'string' ? segment.toolArgs.path : undefined
        )
      if (leaf && title.includes(leaf)) {
        detail = segment.resultSummary?.trim() === '已停止' ? '已停止' : undefined
      }
    }

    steps.push({
      id: segment.id,
      phase,
      kind:
        segment.kind === 'text'
          ? 'narration'
          : (segment.kind as Exclude<ProcessPhaseStepKind, 'narration'>),
      title,
      detail,
      status,
      segment
    })
  }
  return steps
}

/**
 * 按先后顺序的过程步骤（直播与回看统一时间线）。
 * 不按阶段折叠，出现一个就展示一个。
 */
export function deriveChronologicalSteps(
  segments: TurnSegment[],
  options?: { isStreaming?: boolean }
): ProcessPhaseStep[] {
  const isStreaming = options?.isStreaming ?? false
  const source = sourceSegments(segments, isStreaming)
  return buildStepsFromSource(source, isStreaming)
}

function sameReusableSegment(a: TurnSegment, b: TurnSegment): boolean {
  return (
    a === b ||
    (a.id === b.id &&
      a.status === b.status &&
      a.kind === b.kind &&
      a.toolName === b.toolName &&
      a.toolDetail === b.toolDetail &&
      a.resultSummary === b.resultSummary &&
      a.content === b.content &&
      a.exitCode === b.exitCode &&
      a.errorMessage === b.errorMessage)
  )
}

/** 已完成步骤保持同一对象，只换增长中的那一行，避免直播重挂整条时间线 */
export function reuseProcessPhaseSteps(
  prev: ProcessPhaseStep[],
  next: ProcessPhaseStep[]
): ProcessPhaseStep[] {
  if (prev === next) return prev
  if (!prev.length) return next
  const out: ProcessPhaseStep[] = []
  const shared = Math.min(prev.length, next.length)
  for (let i = 0; i < shared; i++) {
    const a = prev[i]!
    const b = next[i]!
    if (
      a.id === b.id &&
      a.phase === b.phase &&
      a.kind === b.kind &&
      a.title === b.title &&
      a.detail === b.detail &&
      a.status === b.status &&
      sameReusableSegment(a.segment, b.segment)
    ) {
      out.push(a)
    } else {
      out.push(b)
    }
  }
  if (next.length > prev.length) out.push(...next.slice(prev.length))
  return out
}

/** 从原始片段派生稳定的四阶段展示模型；不暴露 thinking.content。 */
export function deriveProcessPhases(
  segments: TurnSegment[],
  options?: { isStreaming?: boolean }
): ProcessPhaseModel {
  const isStreaming = options?.isStreaming ?? false
  const source = sourceSegments(segments, isStreaming)
  const chronological = buildStepsFromSource(source, isStreaming)

  const buckets = new Map<ProcessPhase, ProcessPhaseStep[]>()
  for (const phase of PROCESS_PHASE_ORDER) buckets.set(phase, [])
  for (const step of chronological) {
    buckets.get(step.phase)!.push(step)
  }

  const groups = PROCESS_PHASE_ORDER.map((phase): ProcessPhaseGroup => {
    const steps = buckets.get(phase)!
    const state: ProcessPhaseState = steps.some((step) => step.status === 'active')
      ? 'active'
      : steps.some((step) => step.status === 'error')
        ? 'error'
        : steps.some((step) => step.status === 'cancelled') &&
            steps.every((step) => step.status === 'cancelled' || step.status === 'done')
          ? steps.every((step) => step.status === 'cancelled')
            ? 'cancelled'
            : 'done'
          : steps.length > 0
            ? 'done'
            : 'pending'
    return {
      phase,
      label: PHASE_LABELS[phase],
      summary: groupSummary(phase, steps),
      state,
      steps
    }
  })

  const current =
    groups.find((group) => group.state === 'active') ||
    (isStreaming
      ? findLast(groups, (group) => group.state === 'done' || group.state === 'error')
      : undefined)
  const readFiles = new Set<string>()
  const modifiedFiles = new Set<string>()
  let commands = 0
  for (const group of groups) {
    for (const step of group.steps) {
      const name = step.segment.toolName ?? ''
      const files = fileNamesForStep(step)
      if (step.phase === 'explore' && name === 'read_file') files.forEach((file) => readFiles.add(file))
      if (step.phase === 'execute' && EDIT_TOOLS.has(name)) {
        files.forEach((file) => modifiedFiles.add(file))
      }
      // 只统计真正完成的工具命令（kind=tool + done）；status 桥接步 / cancelled 不算
      if (
        step.kind === 'tool' &&
        step.phase === 'execute' &&
        COMMAND_TOOLS.has(name) &&
        step.status === 'done'
      ) {
        commands++
      }
    }
  }

  return {
    groups,
    currentPhase:
      current?.phase ??
      (isStreaming ? findLast(groups, (group) => group.steps.length > 0)?.phase : undefined),
    totals: {
      readFiles: readFiles.size,
      modifiedFiles: modifiedFiles.size,
      commands,
      verifications: buckets.get('verify')!.filter((step) => step.kind === 'tool').length
    }
  }
}

/** 供外层完成态摘要复用。 */
export function summarizeProcessPhases(
  model: ProcessPhaseModel,
  durationSec?: number,
  outcome?: 'success' | 'error' | 'aborted'
): string {
  const parts: string[] = []
  if (model.totals.readFiles > 0) parts.push(`浏览 ${model.totals.readFiles} 个文件`)
  if (model.totals.modifiedFiles > 0) parts.push(`修改 ${model.totals.modifiedFiles} 个文件`)
  if (model.totals.commands > 0) parts.push(`运行 ${model.totals.commands} 个命令`)

  const verify = model.groups.find((group) => group.phase === 'verify')
  if (verify?.state === 'error') parts.push('验证失败')
  else if (verify?.state === 'active') parts.push('验证中')
  else if (verify && verify.steps.length > 0) parts.push('验证完成')

  if (parts.length === 0) {
    if (outcome === 'error') parts.push('未完成')
    else if (outcome === 'aborted') parts.push('已停止')
    else parts.push('完成')
  } else if (outcome === 'error') {
    // 有过程统计时也要标明失败，避免鉴权失败仍显示“完成”
    parts.unshift('未完成')
  } else if (outcome === 'aborted') {
    parts.unshift('已停止')
  }
  if (durationSec != null && durationSec > 0) parts.push(`${durationSec}s`)
  return parts.join(' · ')
}
