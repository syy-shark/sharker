/**
 * 将一轮工具/技能活动转为过程时间线步骤。
 * 详见 shared/README.md
 */
import type { TurnActivity } from './types'

/** 过程步骤状态：已完成或进行中 */
export type ProcessStepStatus = 'done' | 'active'
/** 过程步骤类型 */
export type ProcessStepKind = 'think' | 'skill' | 'tool' | 'compress'

/** 助手消息过程时间线的单步 */
export interface ProcessStep {
  id: string
  kind: ProcessStepKind
  title: string
  detail?: string
  thinkingText?: string
  status: ProcessStepStatus
}

const TOOL_TITLES: Record<string, string> = {
  read_file: '读取文件',
  write_file: '写入文件',
  search_replace: '编辑文件',
  delete_path: '删除路径',
  move_path: '移动路径',
  create_directory: '创建目录',
  list_dir: '列出目录',
  grep: '搜索内容',
  glob_file_search: '查找文件',
  run_terminal_cmd: '运行命令',
  git_status: 'Git 状态',
  git_diff: 'Git 差异',
  git_log: 'Git 日志',
  git_show: 'Git 查看',
  git_add: 'Git 暂存',
  git_commit: 'Git 提交',
  git_pull: 'Git 拉取',
  git_push: 'Git 推送',
  run_skill_script: '运行技能'
}

/** 从活动 label 解析工具名（· 前部分） */
function toolNameFromLabel(label: string): string {
  const dot = label.indexOf(' · ')
  return dot === -1 ? label : label.slice(0, dot)
}

/** 解析工具活动 label 为标题与详情 */
function parseToolLabel(label: string): { title: string; detail?: string; toolName: string } {
  const toolName = toolNameFromLabel(label)
  const dot = label.indexOf(' · ')
  if (dot === -1) {
    return { toolName, title: TOOL_TITLES[toolName] ?? toolName }
  }
  const detail = label.slice(dot + 3)
  return {
    toolName,
    title: TOOL_TITLES[toolName] ?? toolName,
    detail: detail || undefined
  }
}

/** 从 skill label 解析技能名（冒号前） */
function parseSkillName(label: string): string {
  const colon = label.indexOf(':')
  return colon === -1 ? label : label.slice(0, colon)
}

/** 判断相邻步骤是否为同一工具操作 */
function isSameToolStep(a: ProcessStep, title: string, detail?: string): boolean {
  return a.kind === 'tool' && a.title === title && a.detail === detail
}

/** 合并连续相同工具步骤；流式时标记最后一项为 active */
export function buildProcessSteps(options: {
  activities: TurnActivity[]
  hadThinking?: boolean
  thinkingText?: string
  isStreaming?: boolean
  isThinkingLive?: boolean
  activeTool?: string | null
}): ProcessStep[] {
  const steps: ProcessStep[] = []
  const thinking = options.thinkingText?.trim() ?? ''
  const hasThinkContent = Boolean(options.hadThinking || thinking)

  if (hasThinkContent) {
    const thinkActive = Boolean(
      options.isStreaming && options.isThinkingLive && !options.activeTool
    )
    steps.push({
      id: 'think',
      kind: 'think',
      title: thinkActive ? '思考中' : '思考',
      thinkingText: thinking || undefined,
      status: thinkActive ? 'active' : 'done'
    })
  } else if (options.isStreaming && !options.activeTool) {
    steps.push({
      id: 'think-waiting',
      kind: 'think',
      title: '思考中',
      status: 'active'
    })
  }

  for (let i = 0; i < options.activities.length; i++) {
    const a = options.activities[i]
    if (a.kind === 'compress') {
      steps.push({
        id: `compress-${i}`,
        kind: 'compress',
        title: '压缩上下文',
        detail: a.label.includes('·') ? a.label.split('·')[1]?.trim() : undefined,
        status: 'done'
      })
      continue
    }
    if (a.kind === 'skill') {
      const name = parseSkillName(a.label)
      steps.push({
        id: `skill-${name}-${i}`,
        kind: 'skill',
        title: '载入技能',
        detail: name,
        status: 'done'
      })
      continue
    }

    const { title, detail, toolName } = parseToolLabel(a.label)
    if (steps.length > 0 && isSameToolStep(steps[steps.length - 1], title, detail)) {
      continue
    }

    const isLast = i === options.activities.length - 1
    const isActive = Boolean(
      options.isStreaming && isLast && options.activeTool && toolName === options.activeTool
    )

    steps.push({
      id: `tool-${i}-${a.label}`,
      kind: 'tool',
      title,
      detail,
      status: isActive ? 'active' : 'done'
    })
  }

  return steps
}

/** 仅有直接回复时不展开，避免空面板 */
export function canExpandProcess(steps: ProcessStep[]): boolean {
  return steps.length > 0
}

/** 工具英文名 → 中文步骤标题 */
export function toolTitle(toolName: string): string {
  return TOOL_TITLES[toolName] ?? toolName
}
