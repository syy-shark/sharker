/**
 * 工具/技能活动的侧栏 label 格式化。
 * 详见 shared/README.md
 */
import type { TurnActivity } from './types'

const PATH_TOOLS = new Set([
  'read_file',
  'write_file',
  'search_replace',
  'delete_path',
  'move_path',
  'list_dir',
  'grep',
  'glob_file_search',
  'create_directory'
])

/** 取路径 basename（统一斜杠） */
export function basenamePath(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || p
}

/** 从工具参数提取被浏览文件的显示名 */
export function extractBrowsedPaths(
  toolName: string,
  args?: Record<string, unknown>
): string[] {
  if (!args || !PATH_TOOLS.has(toolName)) return []
  const raw = args.path ?? args.target_path ?? args.source_path
  if (typeof raw !== 'string' || !raw.trim()) return []
  return [basenamePath(raw.trim())]
}

/** 格式化工具活动侧栏 label（含路径/命令摘要） */
export function formatToolActivity(
  toolName: string,
  args?: Record<string, unknown>
): string {
  const paths = extractBrowsedPaths(toolName, args)
  if (paths.length) return `${toolName} · ${paths[0]}`
  if (toolName === 'run_terminal_cmd' && typeof args?.command === 'string') {
    const cmd = args.command.trim().replace(/\s+/g, ' ')
    const short = cmd.length > 72 ? `${cmd.slice(0, 69)}…` : cmd
    return `${toolName} · ${short}`
  }
  if (toolName === 'glob_file_search' && typeof args?.pattern === 'string') {
    return `${toolName} · ${args.pattern}`
  }
  return toolName
}

/** 与 Cursor skill 标签格式一致，供 process-steps 解析 */
export function skillActivityLabel(skillName: string): string {
  return `${skillName}:${skillName}`
}

/** 注入系统提示的技能钩子行（英文，模型可读） */
export function buildSkillHookLine(skillNames: string[]): string | null {
  if (skillNames.length === 0) return null
  const tag = skillActivityLabel(skillNames[0])
  return `Using \`${tag}\` to keep the repo workflow loaded before I respond.`
}

/** 将 Skill 名列表转为 TurnActivity 数组 */
export function activitiesFromSkills(skillNames: string[]): TurnActivity[] {
  return skillNames.map((name) => ({
    kind: 'skill' as const,
    label: skillActivityLabel(name)
  }))
}
