/**
 * 将流式 chunk 归并为有序 TurnSegment[]，供直播式过程流渲染。
 * @see shared/README.md
 */
import type { StreamChunk, TurnSegment } from './types'
import { toolTitle } from './process-steps'
import { formatToolActivity } from './turn-meta'

/** 深拷贝片段数组，避免 React 状态引用相等不刷新 */
export function cloneSegments(segments: TurnSegment[]): TurnSegment[] {
  return segments.map((s) => ({
    ...s,
    fileDiff: s.fileDiff
      ? { ...s.fileDiff, lines: [...s.fileDiff.lines], stats: { ...s.fileDiff.stats } }
      : undefined
  }))
}

/** 从工具活动 label 解析详情（· 后部分） */
function detailFromToolLabel(label: string): string | undefined {
  const dot = label.indexOf(' · ')
  return dot === -1 ? undefined : label.slice(dot + 3) || undefined
}

/** 构建工具片段 */
function makeToolSegment(
  toolName: string,
  toolArgs?: Record<string, unknown>,
  toolCallId?: string
): TurnSegment {
  const label = formatToolActivity(toolName, toolArgs)
  return {
    id: `tool-${crypto.randomUUID()}`,
    kind: 'tool',
    toolName,
    toolCallId,
    toolTitle: toolTitle(toolName),
    toolDetail: detailFromToolLabel(label),
    status: 'active'
  }
}

/** 将单个 StreamChunk 增量应用到片段列表，返回新数组 */
export function applyStreamChunk(segments: TurnSegment[], chunk: StreamChunk): TurnSegment[] {
  const next = cloneSegments(segments)

  if (chunk.type === 'think' && chunk.content) {
    let lastThink: TurnSegment | undefined
    for (let i = next.length - 1; i >= 0; i--) {
      if (next[i].kind === 'thinking' && next[i].status === 'active') {
        lastThink = next[i]
        break
      }
    }
    if (lastThink) {
      lastThink.content = (lastThink.content ?? '') + chunk.content
      return next
    }
    next.push({
      id: `think-${crypto.randomUUID()}`,
      kind: 'thinking',
      content: chunk.content,
      status: 'active'
    })
    return next
  }

  if (chunk.type === 'token' && chunk.content) {
    // 结束进行中的思考段
    for (let i = next.length - 1; i >= 0; i--) {
      if (next[i].kind === 'thinking' && next[i].status === 'active') {
        next[i].status = 'done'
        break
      }
    }

    const last = next[next.length - 1]
    if (last?.kind === 'text' && last.status !== 'done') {
      last.content = (last.content ?? '') + chunk.content
    } else {
      next.push({
        id: `text-${crypto.randomUUID()}`,
        kind: 'text',
        content: chunk.content,
        status: 'active'
      })
    }
    return next
  }

  if (chunk.type === 'tool_start' && chunk.toolName) {
    // 结束进行中的思考/文字段
    for (const s of next) {
      if (s.status === 'active' && (s.kind === 'thinking' || s.kind === 'text')) {
        s.status = 'done'
      }
    }
    next.push(makeToolSegment(chunk.toolName, chunk.toolArgs, chunk.toolCallId))
    return next
  }

  if (chunk.type === 'tool_done' && (chunk.toolCallId || chunk.toolName)) {
    let matched = false
    for (let i = next.length - 1; i >= 0; i--) {
      const s = next[i]
      if (s.kind !== 'tool' || s.status !== 'active') continue
      if (chunk.toolCallId && s.toolCallId === chunk.toolCallId) {
        s.status = 'done'
        if (chunk.fileDiff) s.fileDiff = chunk.fileDiff
        matched = true
        break
      }
    }
    if (!matched && chunk.toolName) {
      for (let i = next.length - 1; i >= 0; i--) {
        const s = next[i]
        if (s.kind === 'tool' && s.toolName === chunk.toolName && s.status === 'active') {
          s.status = 'done'
          if (chunk.fileDiff) s.fileDiff = chunk.fileDiff
          break
        }
      }
    }
    return next
  }

  if (chunk.type === 'turn_start' && chunk.skillNames?.length) {
    for (const name of chunk.skillNames) {
      next.push({
        id: `skill-${name}-${crypto.randomUUID()}`,
        kind: 'tool',
        toolName: 'skill',
        toolTitle: '载入技能',
        toolDetail: name,
        status: 'done',
        metaTitle: '载入技能'
      })
    }
    return next
  }

  if (chunk.type === 'context_compress' && chunk.contextCompress) {
    const { removedCount, beforeTokens, afterTokens } = chunk.contextCompress
    next.push({
      id: `compress-${crypto.randomUUID()}`,
      kind: 'tool',
      toolName: 'compress',
      toolTitle: '压缩上下文',
      toolDetail: `${removedCount} 条 → ${beforeTokens}→${afterTokens} tokens`,
      status: 'done'
    })
    return next
  }

  if (chunk.type === 'error' && chunk.error) {
    const last = next[next.length - 1]
    if (last?.kind === 'text' && last.status === 'active') {
      last.content = `${last.content ?? ''}\n\n**错误**: ${chunk.error}`
      last.status = 'done'
    } else {
      next.push({
        id: `error-${crypto.randomUUID()}`,
        kind: 'text',
        content: `**错误**: ${chunk.error}`,
        status: 'done',
        role: 'final'
      })
    }
    return next
  }

  return next
}

/** 回合结束：标记 final 文字、收尾 active 段 */
export function finalizeSegments(segments: TurnSegment[]): TurnSegment[] {
  const next = cloneSegments(segments)

  for (const s of next) {
    if (s.status === 'active') {
      if (s.kind === 'thinking' || s.kind === 'text') s.status = 'done'
      if (s.kind === 'tool') s.status = 'done'
    }
  }

  const textIndices = next
    .map((s, i) => (s.kind === 'text' ? i : -1))
    .filter((i) => i >= 0)

  if (textIndices.length > 0) {
    const lastTextIdx = textIndices[textIndices.length - 1]
    for (let i = 0; i < next.length; i++) {
      const s = next[i]
      if (s.kind !== 'text') continue
      s.role = i === lastTextIdx ? 'final' : 'narration'
    }
  }

  return next
}

/** 从片段列表提取最终回答正文 */
export function extractFinalContent(
  segments: TurnSegment[],
  opts?: { isStreaming?: boolean }
): string {
  if (opts?.isStreaming) {
    const activeText = [...segments]
      .reverse()
      .find((s) => s.kind === 'text' && s.status === 'active')
    // 流式阶段保留未 trim 的正文，避免首字符到达前空白被误判为「无输出」
    if (activeText?.content) return activeText.content
  }

  const finalSeg = [...segments].reverse().find((s) => s.kind === 'text' && s.role === 'final')
  if (finalSeg?.content?.trim()) return finalSeg.content.trim()

  const lastText = [...segments].reverse().find((s) => s.kind === 'text' && s.content?.trim())
  return lastText?.content?.trim() ?? ''
}

/** 过程流展示用片段（不含 final 正文；直播时排除进行中的末段文字） */
export function processSegments(
  segments: TurnSegment[],
  opts?: { isStreaming?: boolean }
): TurnSegment[] {
  let filtered = segments.filter((s) => !(s.kind === 'text' && s.role === 'final'))
  if (opts?.isStreaming) {
    const last = filtered[filtered.length - 1]
    if (last?.kind === 'text' && last.status === 'active') {
      filtered = filtered.slice(0, -1)
    }
  }
  return filtered
}

/** 是否有可展示的过程流 */
export function hasProcessFlow(
  segments: TurnSegment[],
  opts?: { isStreaming?: boolean }
): boolean {
  return processSegments(segments, opts).length > 0
}

/** 统计思考段数量与总字符（用于摘要） */
function countThinking(segments: TurnSegment[]): { count: number; hasContent: boolean } {
  const thinks = segments.filter((s) => s.kind === 'thinking')
  return {
    count: thinks.length,
    hasContent: thinks.some((s) => Boolean(s.content?.trim()))
  }
}

const READ_TOOLS = new Set(['read_file', 'grep', 'glob_file_search', 'list_dir'])
const EDIT_TOOLS = new Set(['write_file', 'search_replace', 'delete_path', 'move_path', 'create_directory'])
const RUN_TOOLS = new Set(['run_terminal_cmd', 'run_skill_script'])

/** 生成结束后摘要 chip 文案 */
export function summarizeSegments(segments: TurnSegment[], durationSec?: number): string {
  const parts: string[] = []
  const think = countThinking(segments)
  if (think.hasContent || think.count > 0) {
    parts.push(durationSec != null && durationSec > 0 ? `思考 ${durationSec}s` : '已思考')
  }

  let readCount = 0
  let editCount = 0
  let runCount = 0
  let otherCount = 0

  for (const s of segments) {
    if (s.kind !== 'tool' || s.status === 'error') continue
    const name = s.toolName ?? ''
    if (READ_TOOLS.has(name)) readCount++
    else if (EDIT_TOOLS.has(name)) editCount++
    else if (RUN_TOOLS.has(name)) runCount++
    else if (name !== 'skill' && name !== 'compress') otherCount++
  }

  if (readCount > 0) parts.push(`读 ${readCount} 个文件`)
  if (editCount > 0) parts.push(`改 ${editCount} 处`)
  if (runCount > 0) parts.push(`运行 ${runCount} 命令`)
  if (otherCount > 0) parts.push(`${otherCount} 步操作`)

  const narrations = segments.filter((s) => s.kind === 'text' && s.role === 'narration').length
  if (narrations > 0 && parts.length === 0) parts.push(`${narrations} 步说明`)

  return parts.length > 0 ? parts.join(' · ') : '已处理'
}

/** 从片段提取浏览文件名列表（去重） */
export function browsedFilesFromSegments(segments: TurnSegment[]): string[] {
  const files: string[] = []
  for (const s of segments) {
    if (s.kind !== 'tool' || !s.toolName || !s.toolDetail) continue
    if (READ_TOOLS.has(s.toolName) || EDIT_TOOLS.has(s.toolName)) {
      const name = s.toolDetail.split('/').pop() ?? s.toolDetail
      if (!files.includes(name)) files.push(name)
    }
  }
  return files
}

/** 从片段还原 TurnActivity[]（兼容旧 meta） */
export function activitiesFromSegments(segments: TurnSegment[]): import('./types').TurnActivity[] {
  const acts: import('./types').TurnActivity[] = []
  for (const s of segments) {
    if (s.kind !== 'tool' || !s.toolName) continue
    if (s.toolName === 'skill') {
      acts.push({ kind: 'skill', label: `${s.toolDetail}:${s.toolDetail}` })
    } else if (s.toolName === 'compress') {
      acts.push({ kind: 'compress', label: `compress · ${s.toolDetail ?? ''}` })
    } else {
      const label = s.toolDetail ? `${s.toolName} · ${s.toolDetail}` : s.toolName
      acts.push({ kind: 'tool', label })
    }
  }
  return acts
}

/** 思考预览：合并所有 thinking 段内容 */
export function thinkingPreviewFromSegments(segments: TurnSegment[]): string {
  return segments
    .filter((s) => s.kind === 'thinking')
    .map((s) => s.content?.trim() ?? '')
    .filter(Boolean)
    .join('\n\n')
}
