/**
 * 将 TurnSegment 纯派生为前端执行阶段，不改变持久化契约。
 * @see shared/README.md
 */
import type { TurnSegment } from './types'

export type ProcessPhase = 'understand' | 'explore' | 'execute' | 'verify'
export type ProcessPhaseState = 'pending' | 'active' | 'done' | 'error'
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

const UNDERSTAND_TOOLS = new Set(['skill', 'compress', 'enter_plan_mode', 'exit_plan_mode'])

const EXPLORE_TOOLS = new Set([
  'read_file',
  'read_image',
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
  'list_skills',
  'read_skill',
  'web_fetch',
  'web_search',
  'open_url',
  'task_list',
  'task_get',
  'task_output',
  'agent_list',
  'agent_get_result',
  'mcp_list_tools',
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
  'run_skill_script',
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
    .replace(/[`*_>#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!clean) return undefined
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

function classifyTool(segment: TurnSegment): ProcessPhase {
  const name = segment.toolName ?? ''
  const detail = segment.toolDetail ?? ''

  if (UNDERSTAND_TOOLS.has(name)) return 'understand'
  if (name === 'verify_removal' || /(?:verify|validate|test|check)/i.test(name)) return 'verify'
  if (COMMAND_TOOLS.has(name) && VERIFY_COMMAND.test(detail)) return 'verify'
  if (EXPLORE_TOOLS.has(name)) return 'explore'
  if (EDIT_TOOLS.has(name)) return 'execute'

  // MCP 名称包含 server 前缀；用末尾动作词补足未知工具的展示归类。
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

function stepTitle(segment: TurnSegment, phase: ProcessPhase): string {
  if (segment.kind === 'thinking') return '分析任务目标与约束'
  if (segment.kind === 'tool') return segment.toolTitle ?? segment.toolName ?? '执行操作'
  if (segment.kind === 'status') {
    return cleanInlineText(segment.content) ?? phaseActiveLabel(phase)
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

function sourceSegments(segments: TurnSegment[], isStreaming: boolean): TurnSegment[] {
  let source = segments.filter((segment) => !(segment.kind === 'text' && segment.role === 'final'))
  if (isStreaming) {
    const last = source[source.length - 1]
    // 末尾 active text 是正在生成的最终回答，不重复放进执行轨道。
    if (last?.kind === 'text' && last.status === 'active') source = source.slice(0, -1)
  }
  return source
}

/** 从原始片段派生稳定的四阶段展示模型；不暴露 thinking.content。 */
export function deriveProcessPhases(
  segments: TurnSegment[],
  options?: { isStreaming?: boolean }
): ProcessPhaseModel {
  const isStreaming = options?.isStreaming ?? false
  const source = sourceSegments(segments, isStreaming)
  const lastActive = isStreaming
    ? [...source].reverse().find((segment) => segment.status === 'active')
    : undefined
  let fallbackPhase: ProcessPhase = 'understand'

  const buckets = new Map<ProcessPhase, ProcessPhaseStep[]>()
  for (const phase of PROCESS_PHASE_ORDER) buckets.set(phase, [])

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
    const status: ProcessPhaseStep['status'] =
      segment.status === 'error'
        ? 'error'
        : isStreaming && segment.id === lastActive?.id
          ? 'active'
          : 'done'

    buckets.get(phase)!.push({
      id: segment.id,
      phase,
      kind:
        segment.kind === 'text'
          ? 'narration'
          : (segment.kind as Exclude<ProcessPhaseStepKind, 'narration'>),
      title: stepTitle(segment, phase),
      detail: segment.kind === 'tool' ? cleanInlineText(segment.toolDetail, 120) : undefined,
      status,
      segment
    })
  }

  const groups = PROCESS_PHASE_ORDER.map((phase): ProcessPhaseGroup => {
    const steps = buckets.get(phase)!
    const state: ProcessPhaseState = steps.some((step) => step.status === 'active')
      ? 'active'
      : steps.some((step) => step.status === 'error')
        ? 'error'
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

  const current = groups.find((group) => group.state === 'active')
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
      if (step.phase === 'execute' && COMMAND_TOOLS.has(name)) commands++
    }
  }

  return {
    groups,
    currentPhase:
      current?.phase ??
      (isStreaming ? [...groups].reverse().find((group) => group.steps.length > 0)?.phase : undefined),
    totals: {
      readFiles: readFiles.size,
      modifiedFiles: modifiedFiles.size,
      commands,
      verifications: buckets.get('verify')!.filter((step) => step.kind === 'tool').length
    }
  }
}

/** 供外层完成态摘要复用。 */
export function summarizeProcessPhases(model: ProcessPhaseModel, durationSec?: number): string {
  const parts: string[] = []
  if (model.totals.readFiles > 0) parts.push(`浏览 ${model.totals.readFiles} 个文件`)
  if (model.totals.modifiedFiles > 0) parts.push(`修改 ${model.totals.modifiedFiles} 个文件`)
  if (model.totals.commands > 0) parts.push(`运行 ${model.totals.commands} 个命令`)

  const verify = model.groups.find((group) => group.phase === 'verify')
  if (verify?.state === 'error') parts.push('验证失败')
  else if (verify?.state === 'active') parts.push('验证中')
  else if (verify && verify.steps.length > 0) parts.push('验证完成')

  if (parts.length === 0) {
    parts.push('完成')
  }
  if (durationSec != null && durationSec > 0) parts.push(`${durationSec}s`)
  return parts.join(' · ')
}
