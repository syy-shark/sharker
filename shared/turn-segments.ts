/**
 * 将流式 chunk 归并为有序 TurnSegment[]，供直播式过程流渲染。
 * @see shared/ARCH.md
 */
import type { FileDiff, FileDiffLine, FileEditPreview, StreamChunk, TurnSegment } from './types'
import { toolTitle } from './process-steps'
import { formatToolActivity } from './turn-meta'

/**
 * 浅拷贝片段数组：每个 segment 新对象，嵌套 diff 行共享。
 * 直播每 token 深拷贝 fileDiff.lines 会卡顿；applyStreamChunk 只改顶层字段或整段替换 diffs。
 */
export function cloneSegments(segments: TurnSegment[]): TurnSegment[] {
  return segments.map((s) => ({ ...s }))
}

/** 从工具活动 label 解析详情（· 后部分） */
function detailFromToolLabel(label: string): string | undefined {
  const dot = label.indexOf(' · ')
  return dot === -1 ? undefined : label.slice(dot + 3) || undefined
}

function splitLines(text: string): string[] {
  if (!text) return []
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

interface StreamingPatchFile {
  path: string
  stats: { added: number; removed: number }
  lines: FileDiffLine[]
}

/** 从尚未写完的 apply_patch 正文抽出各文件 +/-（对标 Codex PatchApplyUpdated，不编造 hunk） */
function parseStreamingPatch(patch: string): StreamingPatchFile[] {
  const files: StreamingPatchFile[] = []
  let current: StreamingPatchFile | null = null
  let oldLine = 0
  let newLine = 0

  const flush = () => {
    if (current?.path) files.push(current)
    current = null
  }

  for (const line of patch.replace(/\r\n/g, '\n').split('\n')) {
    if (line.startsWith('*** Update File: ') || line.startsWith('*** Add File: ')) {
      flush()
      current = {
        path: line.slice(line.indexOf(':') + 1).trim(),
        stats: { added: 0, removed: 0 },
        lines: []
      }
      oldLine = 0
      newLine = 0
      continue
    }
    if (!current) continue
    if (line.startsWith('@@')) {
      const hunk = line.match(/@@\s*-(\d+)(?:,\d+)?\s*\+(\d+)/)
      if (hunk) {
        oldLine = Number(hunk[1])
        newLine = Number(hunk[2])
      }
      continue
    }
    if (line.startsWith('***') || line.startsWith('+++') || line.startsWith('---')) continue
    if (line.startsWith('+')) {
      current.stats.added++
      current.lines.push({
        kind: 'add',
        content: line.slice(1),
        newLine: newLine || undefined
      })
      if (newLine) newLine++
      continue
    }
    if (line.startsWith('-')) {
      current.stats.removed++
      current.lines.push({
        kind: 'del',
        content: line.slice(1),
        oldLine: oldLine || undefined
      })
      if (oldLine) oldLine++
      continue
    }
    if (line.startsWith(' ')) {
      current.lines.push({
        kind: 'ctx',
        content: line.slice(1),
        oldLine: oldLine || undefined,
        newLine: newLine || undefined
      })
      if (oldLine) oldLine++
      if (newLine) newLine++
    }
  }
  flush()
  return files
}

function editPreviewFromPatch(patch: string): FileEditPreview[] {
  return parseStreamingPatch(patch).map(({ path, stats }) => ({ path, stats }))
}

function linesFromText(text: string, kind: 'add' | 'del'): FileDiffLine[] {
  return splitLines(text).map((content, index) =>
    kind === 'add'
      ? { kind, content, newLine: index + 1 }
      : { kind, content, oldLine: index + 1 }
  )
}

/** 参数流里已经出现的 +/-，供同一 `s.id-diff-N` 边写边画 */
function liveDiffLinesFromToolArgs(
  toolName: string | undefined,
  toolArgs: Record<string, unknown> | undefined,
  fileIndex: number
): FileDiffLine[] {
  if (!toolName || !toolArgs) return []
  if (toolName === 'write_file' && fileIndex === 0 && typeof toolArgs.content === 'string') {
    return linesFromText(toolArgs.content, 'add')
  }
  if (toolName === 'search_replace' && fileIndex === 0) {
    const oldString = typeof toolArgs.old_string === 'string' ? toolArgs.old_string : ''
    const newString = typeof toolArgs.new_string === 'string' ? toolArgs.new_string : ''
    return [...linesFromText(oldString, 'del'), ...linesFromText(newString, 'add')]
  }
  if (toolName === 'apply_patch' && typeof toolArgs.patch === 'string') {
    return parseStreamingPatch(toolArgs.patch)[fileIndex]?.lines ?? []
  }
  return []
}

function editPreviewFromToolArgs(
  toolName: string,
  toolArgs?: Record<string, unknown>
): FileEditPreview[] | undefined {
  if (!toolArgs) return undefined

  if (toolName === 'write_file') {
    const path = typeof toolArgs.path === 'string' ? toolArgs.path.trim() : ''
    const content = typeof toolArgs.content === 'string' ? toolArgs.content : ''
    if (!path) return undefined
    return [{ path, stats: { added: splitLines(content).length, removed: 0 } }]
  }

  if (toolName === 'search_replace') {
    const path = typeof toolArgs.path === 'string' ? toolArgs.path.trim() : ''
    const oldString = typeof toolArgs.old_string === 'string' ? toolArgs.old_string : ''
    const newString = typeof toolArgs.new_string === 'string' ? toolArgs.new_string : ''
    if (!path) return undefined
    return [
      {
        path,
        stats: {
          added: splitLines(newString).length,
          removed: splitLines(oldString).length
        }
      }
    ]
  }

  if (toolName === 'apply_patch') {
    if (typeof toolArgs.patch === 'string') {
      const previews = editPreviewFromPatch(toolArgs.patch)
      if (previews.length) return previews
    }
    const path = typeof toolArgs.path === 'string' ? toolArgs.path.trim() : ''
    if (path) return [{ path, stats: { added: 0, removed: 0 } }]
    return undefined
  }

  return undefined
}

const WRITE_PREVIEW_TOOLS = new Set(['write_file', 'search_replace', 'apply_patch'])

/** 写入/补丁参数流：用同一 tool 段占 `s.id-diff-N`，不另开新块 */
export function isWritePreviewTool(toolName: string | undefined): boolean {
  return Boolean(toolName && WRITE_PREVIEW_TOOLS.has(toolName))
}

function mergeGrowingToolArgs(
  prev: Record<string, unknown> | undefined,
  next: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!next) return prev
  if (!prev) return { ...next }
  const out: Record<string, unknown> = { ...prev }
  for (const [key, value] of Object.entries(next)) {
    if (typeof value === 'string' && typeof out[key] === 'string' && value.length < out[key].length) {
      continue
    }
    if (value !== undefined) out[key] = value
  }
  return out
}

function findActiveToolPreview(
  segments: TurnSegment[],
  toolName: string,
  toolCallId?: string
): TurnSegment | undefined {
  for (let i = segments.length - 1; i >= 0; i--) {
    const s = segments[i]
    if (s.kind !== 'tool' || s.toolName !== toolName || s.status !== 'active') continue
    if (toolCallId && s.toolCallId && s.toolCallId !== toolCallId) continue
    return s
  }
  return undefined
}

function diffsFromChunk(chunk: StreamChunk): FileDiff[] | undefined {
  if (chunk.fileDiffs?.length) return chunk.fileDiffs
  if (chunk.fileDiff) return [chunk.fileDiff]
  return undefined
}

function previewFromDiffs(diffs: FileDiff[]): FileEditPreview[] {
  return diffs.map((d) => ({ path: d.path, stats: { ...d.stats } }))
}

/** 构建工具片段 */
function makeToolSegment(
  toolName: string,
  toolArgs?: Record<string, unknown>,
  toolCallId?: string,
  timestamp = Date.now(),
  isVerification = false
): TurnSegment {
  const label = formatToolActivity(toolName, toolArgs)
  const editPreview = editPreviewFromToolArgs(toolName, toolArgs)
  const segment: TurnSegment = {
    id: `tool-${crypto.randomUUID()}`,
    kind: 'tool',
    toolName,
    toolCallId,
    toolTitle: toolTitle(toolName),
    toolArgs,
    toolDetail: detailFromToolLabel(label) ?? editPreview?.[0]?.path,
    editPreview,
    status: 'active',
    startedAt: timestamp,
    isVerification
  }
  // 内联演示：HTML 存在 segment.content，UI 直接嵌入渲染，不依赖截断后的 resultOutput
  if (toolName === 'present_inline_demo' && typeof toolArgs?.html === 'string') {
    segment.content = toolArgs.html
    if (typeof toolArgs.caption === 'string' && toolArgs.caption.trim()) {
      segment.toolDetail = toolArgs.caption.trim()
    }
  }
  return segment
}

/** 将单个 StreamChunk 增量应用到片段列表，返回新数组 */
/** 只换数组和改过的段，已完成工具对象保持引用，避免每 token 打穿 memo */
function applyThinkChunk(segments: TurnSegment[], content: string, timestamp: number): TurnSegment[] {
  const next = segments.slice()
  for (let i = 0; i < next.length; i++) {
    const s = next[i]
    if (s.kind === 'status' && s.status === 'active' && (s.content ?? '').includes('准备')) {
      next[i] = { ...s, status: 'done', endedAt: timestamp }
    }
  }
  for (let i = next.length - 1; i >= 0; i--) {
    if (next[i].kind === 'thinking' && next[i].status === 'active') {
      next[i] = { ...next[i], content: (next[i].content ?? '') + content }
      return next
    }
  }
  next.push({
    id: `think-${crypto.randomUUID()}`,
    kind: 'thinking',
    content,
    status: 'active',
    startedAt: timestamp
  })
  return next
}

function applyTokenChunk(segments: TurnSegment[], content: string, timestamp: number): TurnSegment[] {
  const next = segments.slice()
  for (let i = next.length - 1; i >= 0; i--) {
    if ((next[i].kind === 'thinking' || next[i].kind === 'status') && next[i].status === 'active') {
      next[i] = { ...next[i], status: 'done', endedAt: timestamp }
      break
    }
  }
  const last = next[next.length - 1]
  if (last?.kind === 'text' && last.status !== 'done') {
    next[next.length - 1] = { ...last, content: (last.content ?? '') + content }
    return next
  }
  next.push({
    id: `text-${crypto.randomUUID()}`,
    kind: 'text',
    content,
    status: 'active',
    startedAt: timestamp
  })
  return next
}

export function applyStreamChunk(segments: TurnSegment[], chunk: StreamChunk): TurnSegment[] {
  const timestamp = chunk.timestamp ?? Date.now()
  if (chunk.type === 'think' && chunk.content) {
    return applyThinkChunk(segments, chunk.content, timestamp)
  }
  if (chunk.type === 'token' && chunk.content) {
    return applyTokenChunk(segments, chunk.content, timestamp)
  }
  if (
    chunk.type === 'harness_mode' ||
    chunk.type === 'plan_ready' ||
    chunk.type === 'command' ||
    chunk.type === 'done'
  ) {
    return segments
  }
  const next = cloneSegments(segments)

  // 回合一启动就给出可见“准备”步骤，避免 UI 空白停住
  if (chunk.type === 'turn_start') {
    const hasWork = next.some(
      (s) =>
        s.status === 'active' ||
        s.kind === 'tool' ||
        s.kind === 'thinking' ||
        s.kind === 'text' ||
        s.kind === 'status'
    )
    if (!hasWork) {
      next.push({
        id: `status-turn-start-${timestamp}`,
        kind: 'status',
        content: '连接模型并准备任务…',
        status: 'active',
        startedAt: timestamp
      })
    }
    return next
  }

  if (chunk.type === 'status' && chunk.content) {
    // 工具进行中的状态：写回 active tool 详情，直播步骤不会看起来“卡住不动”
    const activeTools = next.filter((s) => s.kind === 'tool' && s.status === 'active')
    const activeTool = chunk.toolName
      ? findLastSegment(next, (s) => s.kind === 'tool' && s.status === 'active' && s.toolName === chunk.toolName)
      : activeTools.length === 1
        ? activeTools[0]
        : undefined
    if (activeTool) {
      const clean = chunk.content.trim()
      if (clean) {
        // 源码/JSON 首行不适合当工具详情
        const codeLike = /^(L\d+:|[{}\[\]]|```)/.test(clean)
        // 进度心跳（执行中… / 已启动…）只写 resultSummary，避免冲掉 path/command 标题摘要
        const progressLike =
          /^(已启动|执行中|运行中|处理中)/.test(clean) ||
          /执行中…\s*\d+s/.test(clean) ||
          /·\s*\d+s$/.test(clean)
        if (!codeLike && !progressLike) {
          // 真正的路径/命令细节才更新 toolDetail
          activeTool.toolDetail = clean.length > 120 ? `${clean.slice(0, 119)}…` : clean
        }
        // 轻量结果/进度预览，供直播 detail 显示；完成后会被正式 resultSummary 覆盖
        activeTool.resultSummary = clean.length > 160 ? `${clean.slice(0, 159)}…` : clean
      }
      return next
    }

    const last = next[next.length - 1]
    if (last?.kind === 'status' && last.status === 'active') {
      last.content = chunk.content
      last.toolName = chunk.toolName ?? last.toolName
      last.toolTitle = chunk.toolName ? toolTitle(chunk.toolName) : last.toolTitle
      return next
    }
    // 合并本地 seed / 过期 status，避免堆多条「准备中」
    for (let i = next.length - 1; i >= 0; i--) {
      const s = next[i]
      if (s.kind === 'status' && s.status === 'active') {
        s.content = chunk.content
        s.toolName = chunk.toolName ?? s.toolName
        s.toolTitle = chunk.toolName ? toolTitle(chunk.toolName) : s.toolTitle
        return next
      }
    }
    next.push({
      id: `status-${crypto.randomUUID()}`,
      kind: 'status',
      content: chunk.content,
      toolName: chunk.toolName,
      toolTitle: chunk.toolName ? toolTitle(chunk.toolName) : undefined,
      status: 'active',
      startedAt: timestamp
    })
    return next
  }

  if (chunk.type === 'tool_preview' && chunk.toolName && isWritePreviewTool(chunk.toolName)) {
    const incoming = chunk.toolArgs
    let target = findActiveToolPreview(next, chunk.toolName, chunk.toolCallId)
    if (!target) {
      for (const s of next) {
        if (s.status === 'active' && (s.kind === 'thinking' || s.kind === 'status')) {
          s.status = 'done'
          s.endedAt = timestamp
        }
      }
      target = makeToolSegment(chunk.toolName, incoming, chunk.toolCallId, timestamp, false)
      next.push(target)
    } else {
      const merged = mergeGrowingToolArgs(target.toolArgs, incoming)
      const preview = editPreviewFromToolArgs(chunk.toolName, merged)
      target.toolArgs = merged
      if (preview) target.editPreview = preview
      if (chunk.toolCallId && !target.toolCallId) target.toolCallId = chunk.toolCallId
      const label = formatToolActivity(chunk.toolName, merged)
      target.toolDetail = detailFromToolLabel(label) ?? preview?.[0]?.path ?? target.toolDetail
    }
    return next
  }

  if (chunk.type === 'tool_preview' && chunk.toolName === 'present_inline_demo') {
    // 参数流中：尽早创建/更新演示片段，做多少显示多少（允许 html 暂为空以占位）
    const html = typeof chunk.content === 'string' ? chunk.content : ''
    const caption =
      typeof chunk.toolArgs?.caption === 'string' ? chunk.toolArgs.caption.trim() : undefined
    let target: TurnSegment | undefined
    for (let i = next.length - 1; i >= 0; i--) {
      const s = next[i]
      if (s.kind !== 'tool' || s.toolName !== 'present_inline_demo') continue
      if (s.status !== 'active') continue
      if (chunk.toolCallId && s.toolCallId && s.toolCallId !== chunk.toolCallId) continue
      target = s
      break
    }
    if (!target) {
      // 只结束思考/status，保留已出的文字段在主区
      for (const s of next) {
        if (s.status === 'active' && (s.kind === 'thinking' || s.kind === 'status')) {
          s.status = 'done'
          s.endedAt = timestamp
        }
      }
      target = makeToolSegment(
        'present_inline_demo',
        { html: html || ' ', ...(caption ? { caption } : {}) },
        chunk.toolCallId,
        timestamp,
        false
      )
      // 空占位时 content 至少非空，便于 buildAnswerParts 收录
      if (!html) target.content = ''
      next.push(target)
    } else {
      // 只前进不回退，避免乱序 chunk 把更长 html 冲短
      if (html.length >= (target.content?.length ?? 0)) {
        target.content = html
      }
      if (chunk.toolCallId && !target.toolCallId) target.toolCallId = chunk.toolCallId
      if (caption) target.toolDetail = caption
    }
    return next
  }

  if (chunk.type === 'tool_start' && chunk.toolName) {
    // 结束进行中的思考/文字段
    for (const s of next) {
      if (
        s.status === 'active' &&
        (s.kind === 'thinking' || s.kind === 'status' || s.kind === 'text')
      ) {
        s.status = 'done'
        s.endedAt = timestamp
      }
    }
    // 演示 / 写入若已有参数流预览段：合并到完整参数，避免重复块、保住 `s.id-diff-N`
    if (chunk.toolName === 'present_inline_demo' || isWritePreviewTool(chunk.toolName)) {
      const s = findActiveToolPreview(next, chunk.toolName, chunk.toolCallId)
      if (s) {
        const full = makeToolSegment(
          chunk.toolName,
          chunk.toolArgs ?? s.toolArgs,
          chunk.toolCallId ?? s.toolCallId,
          s.startedAt ?? timestamp,
          chunk.isVerification
        )
        s.toolCallId = full.toolCallId
        s.toolArgs = full.toolArgs ?? s.toolArgs
        s.content = full.content ?? s.content
        s.toolDetail = full.toolDetail ?? s.toolDetail
        s.toolTitle = full.toolTitle
        if (full.editPreview) s.editPreview = full.editPreview
        s.isVerification = full.isVerification
        return next
      }
    }
    next.push(makeToolSegment(
      chunk.toolName,
      chunk.toolArgs,
      chunk.toolCallId,
      timestamp,
      chunk.isVerification
    ))
    return next
  }

  if (chunk.type === 'tool_done' && (chunk.toolCallId || chunk.toolName)) {
    const diffs = diffsFromChunk(chunk)
    let matched = false
    for (let i = next.length - 1; i >= 0; i--) {
      const s = next[i]
      if (s.kind !== 'tool' || s.status !== 'active') continue
      if (chunk.toolCallId && s.toolCallId === chunk.toolCallId) {
        s.status = chunk.toolStatus === 'error' ? 'error' : 'done'
        s.endedAt = timestamp
        s.resultSummary = chunk.resultSummary
        s.resultOutput = chunk.resultOutput
        s.errorMessage = chunk.error
        s.exitCode = chunk.exitCode
        if (diffs) {
          s.fileDiffs = diffs
          s.fileDiff = chunk.fileDiff ?? diffs[diffs.length - 1]
          s.editPreview = previewFromDiffs(diffs)
        }
        matched = true
        break
      }
    }
    if (!matched && chunk.toolName) {
      for (let i = next.length - 1; i >= 0; i--) {
        const s = next[i]
        if (s.kind === 'tool' && s.toolName === chunk.toolName && s.status === 'active') {
          s.status = chunk.toolStatus === 'error' ? 'error' : 'done'
          s.endedAt = timestamp
          s.resultSummary = chunk.resultSummary
          s.resultOutput = chunk.resultOutput
          s.errorMessage = chunk.error
          s.exitCode = chunk.exitCode
          if (diffs) {
            s.fileDiffs = diffs
            s.fileDiff = chunk.fileDiff ?? diffs[diffs.length - 1]
            s.editPreview = previewFromDiffs(diffs)
          }
          break
        }
      }
    }
    return next
  }

  if (chunk.type === 'approval_needed' && chunk.approval) {
    const active = findLastSegment(
      next,
      (segment) =>
        segment.kind === 'tool' &&
        segment.status === 'active' &&
        segment.toolName === chunk.approval?.toolName
    )
    if (active) active.approval = chunk.approval
    // 显式状态步：直播区即使工具标题被折叠，也能看到“等待确认”
    const last = next[next.length - 1]
    if (last?.kind === 'status' && last.status === 'active') {
      last.content = `等待确认 · ${chunk.approval.title || chunk.approval.toolName}`
      last.toolName = chunk.approval.toolName
      last.toolTitle = toolTitle(chunk.approval.toolName)
    } else {
      next.push({
        id: `status-approval-${timestamp}`,
        kind: 'status',
        content: `等待确认 · ${chunk.approval.title || chunk.approval.toolName}`,
        toolName: chunk.approval.toolName,
        toolTitle: toolTitle(chunk.approval.toolName),
        status: 'active',
        startedAt: timestamp
      })
    }
    return next
  }

  if (chunk.type === 'approval_resolved' && chunk.toolName) {
    const active = findLastSegment(
      next,
      (segment) =>
        segment.kind === 'tool' && segment.status === 'active' && segment.toolName === chunk.toolName
    )
    if (active && chunk.approved) active.approval = undefined
    for (const s of next) {
      if (
        s.kind === 'status' &&
        s.status === 'active' &&
        (s.content ?? '').includes('等待确认')
      ) {
        s.status = 'done'
        s.endedAt = timestamp
        s.content = chunk.approved ? '已确认，继续执行' : '已拒绝该操作'
      }
    }
    return next
  }

  if (chunk.type === 'turn_cancelled') {
    let marked = false
    for (const segment of next) {
      if (segment.status !== 'active') continue
      segment.status = 'cancelled'
      segment.endedAt = timestamp
      if (segment.kind === 'tool') {
        segment.errorMessage = '任务已停止'
        const summary = segment.resultSummary?.trim() || ''
        const progressLike =
          /^(已启动|执行中|运行中|处理中)/.test(summary) ||
          /执行中…\s*\d+s/.test(summary) ||
          /·\s*\d+s$/.test(summary)
        if (!summary || progressLike) segment.resultSummary = '已停止'
      }
      marked = true
    }
    if (!marked) {
      const latestTool = findLastSegment(
        next,
        (segment) => segment.kind === 'tool' && segment.status === 'error'
      )
      if (latestTool) {
        latestTool.status = 'cancelled'
        latestTool.endedAt = timestamp
        latestTool.errorMessage = '任务已停止'
      }
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
      ,startedAt: timestamp
      ,endedAt: timestamp
    })
    return next
  }

  if (chunk.type === 'error' && chunk.error) {
    const last = next[next.length - 1]
    if (last?.kind === 'text' && last.status === 'active') {
      last.content = `${last.content ?? ''}\n\n**错误**: ${chunk.error}`
      last.status = 'done'
    } else if (last?.kind === 'status' && last.status === 'active') {
      last.status = 'done'
      next.push({
        id: `error-${crypto.randomUUID()}`,
        kind: 'text',
        content: `**错误**: ${chunk.error}`,
        status: 'done',
        role: 'final'
      })
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
export function finalizeSegments(segments: TurnSegment[], endedAt = Date.now()): TurnSegment[] {
  const next = cloneSegments(segments)

  for (const s of next) {
    if (s.status === 'active') {
      if (s.kind === 'thinking' || s.kind === 'status' || s.kind === 'text') s.status = 'done'
      // 未收到 tool_done 的工具：视为中止/未完成，而不是“已成功完成”
      if (s.kind === 'tool') {
        s.status = 'cancelled'
        const summary = s.resultSummary?.trim() || ''
        const progressLike =
          /^(已启动|执行中|运行中|处理中)/.test(summary) ||
          /执行中…\s*\d+s/.test(summary) ||
          /·\s*\d+s$/.test(summary)
        if (progressLike) {
          s.resultSummary = '已停止'
          if (!s.errorMessage) s.errorMessage = '已停止'
        } else if (!s.resultSummary) {
          s.resultSummary = '已停止'
        }
      }
      s.endedAt = endedAt
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

/** 是否仍有进行中的工具/思考（此时中途旁白不应当最终回答） */
function hasActiveWork(segments: TurnSegment[]): boolean {
  return segments.some(
    (s) =>
      s.status === 'active' &&
      (s.kind === 'tool' || s.kind === 'thinking' || s.kind === 'status')
  )
}

/** 从后往前找片段，避免每 token `[...].reverse()` 拷数组 */
export function findLastSegment(
  segments: TurnSegment[],
  pred: (s: TurnSegment) => boolean
): TurnSegment | undefined {
  for (let i = segments.length - 1; i >= 0; i--) {
    const s = segments[i]
    if (pred(s)) return s
  }
  return undefined
}

/** 从片段列表提取最终回答正文 */
export function extractFinalContent(
  segments: TurnSegment[],
  opts?: { isStreaming?: boolean }
): string {
  if (opts?.isStreaming) {
    const activeText = findLastSegment(
      segments,
      (s) => s.kind === 'text' && s.status === 'active'
    )
    // 流式阶段保留未 trim 的正文，避免首字符到达前空白被误判为「无输出」
    if (activeText?.content) return activeText.content
    // 工具/思考仍在进行：不要把中途已闭合的旁白当成最终回答（否则过程区+正文重复）
    if (hasActiveWork(segments)) return ''
    // 无 active 工作：用末尾文本（可能刚标 done 尚未 finalize）
    const trailing = findLastSegment(
      segments,
      (s) => s.kind === 'text' && Boolean(s.content?.trim())
    )
    return trailing?.content ?? ''
  }

  const finalSeg = findLastSegment(segments, (s) => s.kind === 'text' && s.role === 'final')
  if (finalSeg?.content?.trim()) return finalSeg.content.trim()

  const lastText = findLastSegment(segments, (s) => s.kind === 'text' && Boolean(s.content?.trim()))
  return lastText?.content?.trim() ?? ''
}

/** 旁白是否与最终回答重复（应只显示在 final 区） */
function isDuplicateOfFinal(content: string | undefined, finalContent: string): boolean {
  const c = (content ?? '').trim()
  if (!c || !finalContent) return false
  if (c === finalContent) return true
  // 中途完整段落后来又作为 final 重发 / 几乎相同
  if (finalContent.startsWith(c) && c.length >= 12) return true
  if (c.startsWith(finalContent) && finalContent.length >= 12) return true
  return false
}

/** 是否像“桥接/准备” status：完成后不应单独占过程行 */
function isBridgeLikeStatus(segment: TurnSegment): boolean {
  if (segment.kind !== 'status' && segment.kind !== 'thinking') return false
  const text = (segment.content || segment.toolTitle || '').trim()
  if (!text) return true
  if (segment.kind === 'thinking') return true
  if (text.includes('规划下一步') || text.includes('决定下一动作')) return true
  if (text.includes('连接模型并准备') || text.includes('准备任务')) return true
  if (text.startsWith('正在准备')) return true
  if (text.includes('已确认') || text.includes('继续执行')) return true
  if (text.includes('已授权') || text.includes('已拒绝该操作')) return true
  if (text === '处理中' || text === '思考中') return true
  return false
}

/** 过程流展示用片段（不含 final 正文；thinking/纯桥接在完成后剔除） */
export function processSegments(
  segments: TurnSegment[],
  opts?: { isStreaming?: boolean }
): TurnSegment[] {
  const isStreaming = opts?.isStreaming ?? false
  let filtered = segments.filter((s) => !(s.kind === 'text' && s.role === 'final'))
  if (isStreaming) {
    const last = filtered[filtered.length - 1]
    if (last?.kind === 'text' && last.status === 'active') {
      filtered = filtered.slice(0, -1)
    }
  }

  // 去掉与最终回答重复的旁白，避免「✓ 一句」+ 下方正文再一句
  const finalContent = extractFinalContent(segments, {
    isStreaming
  }).trim()
  if (finalContent) {
    filtered = filtered.filter(
      (s) => !(s.kind === 'text' && isDuplicateOfFinal(s.content, finalContent))
    )
  }

  const hasTool = filtered.some((s) => s.kind === 'tool')
  filtered = filtered.filter((s) => {
    // thinking 永不进入过程时间线（直播时由 TurnFlow 合成「思考中」）
    if (s.kind === 'thinking') return isStreaming && !hasTool && s.status === 'active'
    if (!isStreaming) {
      if (isBridgeLikeStatus(s)) return false
      // 有工具步骤时，status 工具回声（读取文件/列出目录）不重复展示
      if (
        hasTool &&
        s.kind === 'status' &&
        (s.toolName || /^(读取|列出|运行|写入|修改|搜索)/.test((s.content || '').trim()))
      ) {
        return false
      }
    }
    return true
  })

  return filtered
}

/** 是否有可展示的过程流（与 TurnFlow 完成后可见步骤对齐，避免点开空白） */
export function hasProcessFlow(
  segments: TurnSegment[],
  opts?: { isStreaming?: boolean }
): boolean {
  const process = processSegments(segments, opts)
  if (process.length === 0) return false
  // 直播中只要有过程片段即可；完成后需至少有 tool/narration/error
  if (opts?.isStreaming) return true
  return process.some(
    (s) =>
      s.kind === 'tool' ||
      s.kind === 'text' ||
      s.status === 'error' ||
      (s.kind === 'status' && !isBridgeLikeStatus(s))
  )
}

const DEMO_FENCE_RE =
  /```(?:demo|demo-html|html-demo|visualization|viz|inline-demo)\b/i
const TABLE_RE = /\|.+\|[\r\n]+\|[-:\s|]+\|/

function normalizeForCompare(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/** 从最终回答中抽出 demo 代码块（过程已讲过时只保留可视化） */
export function extractDemoBlocksFromContent(content: string): string {
  const matches = content.match(
    /```(?:demo|demo-html|html-demo|visualization|viz|inline-demo)[^\n]*\n[\s\S]*?```/gi
  )
  return matches?.join('\n\n').trim() ?? ''
}

/**
 * 是否在消息底部展示最终正文。
 *
 * 原则：
 * - 文字与内联演示要能融合：可在 demo 上/下，可短可长
 * - 只去掉「与过程旁白几乎一字不差」的真复读
 * - 绝不能因为用过 present_inline_demo 就把讲解整段藏掉
 */
export function shouldDisplayFinalBody(
  finalContent: string,
  segments: TurnSegment[],
  opts?: { isStreaming?: boolean }
): { show: boolean; content: string } {
  const text = finalContent
  const trimmed = text.trim()
  if (!trimmed) return { show: false, content: '' }

  // 直播中始终露出，避免「打完字结束却突然消失」
  if (opts?.isStreaming) {
    return { show: true, content: text }
  }

  // 含 fence demo / 表格：一定是回答的一部分
  if (DEMO_FENCE_RE.test(trimmed) || TABLE_RE.test(trimmed)) {
    return { show: true, content: text }
  }

  const process = processSegments(segments, opts)
  if (process.length === 0) {
    return { show: true, content: text }
  }

  const finalNorm = normalizeForCompare(trimmed)
  const narrations = process
    .filter((s) => s.kind === 'text')
    .map((s) => normalizeForCompare(s.content ?? ''))
    .filter(Boolean)

  // 仅当真·整段复读某条过程旁白时才藏（两边都够长才比，避免误伤短句）
  for (const n of narrations) {
    if (n.length < 24 || finalNorm.length < 24) continue
    if (n === finalNorm) {
      return { show: false, content: '' }
    }
    // 几乎相同：一方完整包含另一方且长度差很小
    const longer = n.length >= finalNorm.length ? n : finalNorm
    const shorter = n.length >= finalNorm.length ? finalNorm : n
    if (longer.startsWith(shorter) && longer.length - shorter.length < 16) {
      return { show: false, content: '' }
    }
  }

  // 其余情况一律展示：含 demo 后的讲解、引导、结论
  return { show: true, content: text }
}

/** 对话主区回答部件：文字、内联演示与写盘 diff 按时间顺序交错 */
export type AnswerPart =
  | { type: 'text'; id: string; content: string }
  | { type: 'demo'; id: string; html: string; caption?: string; streaming?: boolean }
  | { type: 'diff'; id: string; diff: FileDiff }

/** 正文里的 ```demo 围栏：开闭都抽出，避免 text key 从 `s.id` 换成 `-pre` 再换回来 */
function extractStreamingDemoFence(text: string): {
  before: string
  html: string
  after: string
  caption?: string
  closed: boolean
} | null {
  const re =
    /```(?:demo|demo-html|html-demo|visualization|viz|inline-demo)([^\n]*)\n/i
  const m = text.match(re)
  if (!m || m.index == null) return null
  const afterOpen = text.slice(m.index + m[0].length)
  const info = (m[1] ?? '').trim()
  const capMatch = info.match(/(?:caption|title)\s*=\s*["']([^"']+)["']/i)
  const caption = capMatch?.[1]?.trim() || undefined
  const before = text.slice(0, m.index)
  const closeIdx = afterOpen.indexOf('```')
  if (closeIdx === -1) {
    return { before, html: afterOpen, after: '', caption, closed: false }
  }
  const html = afterOpen.slice(0, closeIdx).replace(/\n$/, '')
  const afterClose = afterOpen.slice(closeIdx + 3)
  const nl = afterClose.indexOf('\n')
  const after = nl === -1 ? '' : afterClose.slice(nl + 1)
  return { before, html, after, caption, closed: true }
}

/**
 * 从片段抽出「回答流」：旁白/终稿文字 + present_inline_demo + 写盘 diff，按先后顺序。
 * 供结束后与直播时主区融合渲染（文字可在 demo 上/下）。
 * 直播时含 tool_preview / ```demo 渐进 HTML（开闭同一 demo key）；写入/补丁参数流占同一 `s.id-diff-N`，用已解析的 +/- 行边写边画（对标 Codex 约 0.5s 逐文件 diff），完成后换核实 fileDiff。
 */
export function buildAnswerParts(
  segments: TurnSegment[],
  opts?: { isStreaming?: boolean }
): AnswerPart[] {
  const isStreaming = opts?.isStreaming ?? false
  const parts: AnswerPart[] = []
  const seenText = new Set<string>()

  for (const s of segments) {
    if (s.kind === 'tool' && s.toolName !== 'present_inline_demo') {
      const diffs = s.fileDiffs ?? (s.fileDiff ? [s.fileDiff] : [])
      if (diffs.length) {
        diffs.forEach((diff, index) => {
          if (!diff?.path || !diff.lines?.length) return
          parts.push({ type: 'diff', id: `${s.id}-diff-${index}`, diff })
        })
      } else if (isStreaming && s.status === 'active') {
        for (const [index, preview] of (s.editPreview ?? []).entries()) {
          if (!preview.path) continue
          parts.push({
            type: 'diff',
            id: `${s.id}-diff-${index}`,
            diff: {
              path: preview.path,
              lines: liveDiffLinesFromToolArgs(s.toolName, s.toolArgs, index),
              stats: { added: preview.stats.added, removed: preview.stats.removed }
            }
          })
        }
      }
    }
    if (s.kind === 'tool' && s.toolName === 'present_inline_demo') {
      if (s.status === 'error') continue
      // 直播占位：尚无 html 也出 demo 壳，避免只显示「处理中」
      const html = s.content ?? ''
      if (!html.trim() && !(isStreaming && s.status === 'active')) continue
      parts.push({
        type: 'demo',
        id: s.id,
        html: html || '<!-- streaming -->',
        caption: s.toolDetail,
        streaming: isStreaming && s.status === 'active'
      })
      continue
    }

    if (s.kind !== 'text' || !s.content?.trim()) continue

    // ```demo 开闭都拆成稳定槽：前文保持 s.id，演示保持 s.id-demo-stream，收束不搬回 Markdown
    const demo = extractStreamingDemoFence(s.content)
    if (demo && (demo.html.trim() || (isStreaming && !demo.closed))) {
      if (demo.before.trim()) {
        const normBefore = normalizeForCompare(demo.before)
        if (!seenText.has(normBefore)) {
          seenText.add(normBefore)
          parts.push({ type: 'text', id: s.id, content: demo.before })
        }
      }
      parts.push({
        type: 'demo',
        id: `${s.id}-demo-stream`,
        html: demo.html || '<!-- streaming -->',
        caption: demo.caption,
        streaming: isStreaming && !demo.closed
      })
      if (demo.after.trim()) {
        const normAfter = normalizeForCompare(demo.after)
        if (!seenText.has(normAfter)) {
          seenText.add(normAfter)
          parts.push({ type: 'text', id: `${s.id}-post`, content: demo.after })
        }
      }
      continue
    }

    // 直播：末尾 active 的正在生成文本要进主区
    if (!isStreaming) {
      // 结束后：narration + final 都可进主区；与过程区可能重复的短句仍可显示在 demo 旁
      if (s.role === 'narration' && s.content.trim().length < 8) continue
    }

    const norm = normalizeForCompare(s.content)
    if (seenText.has(norm)) continue
    seenText.add(norm)
    parts.push({ type: 'text', id: s.id, content: s.content })
  }

  return parts
}

/** 统计思考段数量与总字符（用于摘要） */
function countThinking(segments: TurnSegment[]): { count: number; hasContent: boolean } {
  const thinks = segments.filter((s) => s.kind === 'thinking')
  return {
    count: thinks.length,
    hasContent: thinks.some((s) => Boolean(s.content?.trim()))
  }
}

const READ_TOOLS = new Set([
  'read_file',
  'grep',
  'glob_file_search',
  'list_dir',
  'read_thread_terminal'
])
const EDIT_TOOLS = new Set([
  'write_file',
  'search_replace',
  'apply_patch',
  'delete_path',
  'move_path',
  'create_directory'
])
const RUN_TOOLS = new Set(['run_terminal_cmd'])

function formatDuration(sec: number): string {
  if (sec < 1) return '<1s'
  return `${sec}s`
}

function shortPath(path: string): string {
  return path.split(/[\\/]/).pop() || path
}

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
    else if (name !== 'compress') otherCount++
  }

  if (readCount > 0) parts.push(`读 ${readCount} 个文件`)
  if (editCount > 0) parts.push(`改 ${editCount} 处`)
  if (runCount > 0) parts.push(`运行 ${runCount} 命令`)
  if (otherCount > 0) parts.push(`${otherCount} 步操作`)

  const narrations = segments.filter((s) => s.kind === 'text' && s.role === 'narration').length
  if (narrations > 0 && parts.length === 0) parts.push(`${narrations} 步说明`)

  return parts.length > 0 ? parts.join(' · ') : '已处理'
}

/** 直播阶段的高层进度摘要：隐藏推理细节，只描述已做与正在做 */
export function summarizeLiveSegments(segments: TurnSegment[], durationSec?: number): string {
  const parts: string[] = []
  if (durationSec != null) parts.push(`处理中 ${formatDuration(durationSec)}`)

  let readCount = 0
  let editCount = 0
  let runCount = 0
  let otherCount = 0

  for (const s of segments) {
    if (s.kind !== 'tool' || s.status !== 'done') continue
    const name = s.toolName ?? ''
    if (READ_TOOLS.has(name)) readCount++
    else if (EDIT_TOOLS.has(name) || name === 'apply_patch') {
      editCount += s.fileDiffs?.length ?? (s.fileDiff ? 1 : 1)
    } else if (RUN_TOOLS.has(name)) runCount++
    else if (name !== 'compress') otherCount++
  }

  if (readCount > 0) parts.push(`已读 ${readCount} 个文件`)
  if (editCount > 0) parts.push(`已改 ${editCount} 个文件`)
  if (runCount > 0) parts.push(`已运行 ${runCount} 个命令`)
  if (otherCount > 0) parts.push(`已完成 ${otherCount} 步`)

  const activeStatus = findLastSegment(
    segments,
    (s) => s.kind === 'status' && s.status === 'active' && Boolean(s.content?.trim())
  )
  const active = findLastSegment(segments, (s) => s.kind === 'tool' && s.status === 'active')
  if (activeStatus?.content) {
    parts.push(activeStatus.content)
  } else if (active) {
    const previewPath = active.editPreview?.[0]?.path
    const detail = active.fileDiff?.path ?? previewPath ?? active.toolDetail
    const suffix = detail ? ` ${shortPath(detail)}` : ''
    parts.push(`正在${active.toolTitle ?? '处理'}${suffix}`)
  } else if (segments.some((s) => s.kind === 'thinking' && s.status === 'active')) {
    parts.push('正在梳理下一步')
  }

  return parts.length > 0 ? parts.join(' · ') : '处理中'
}

/** 从片段提取浏览文件名列表（去重） */
export function browsedFilesFromSegments(segments: TurnSegment[]): string[] {
  const files: string[] = []
  for (const s of segments) {
    if (s.kind !== 'tool' || !s.toolName) continue
    const diffs = s.fileDiffs ?? (s.fileDiff ? [s.fileDiff] : [])
    for (const diff of diffs) {
      const name = shortPath(diff.path)
      if (!files.includes(name)) files.push(name)
    }
    if (!s.toolDetail) continue
    if (READ_TOOLS.has(s.toolName) || EDIT_TOOLS.has(s.toolName)) {
      const name = shortPath(s.toolDetail)
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
    if (s.toolName === 'compress') {
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
