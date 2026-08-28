/**
 * OpenAI 兼容 Chat Completions 客户端：流式输出、工具调用、超时与降级重试。
 * @see providers/ARCH.md
 */
import type { AppSettings, ProviderConfig } from '../shared/types'
import { TOOL_DEFINITIONS } from '../agent/tool-definitions'
import { getToolDefinitionsForPhase } from '../tools/registry'
import { inferProviderVision } from '../shared/provider-vision'
import { buildThinkingRequestFields } from '../shared/thinking-levels'
import { filterListedModels } from '../shared/provider-catalog'
import { toolTitle } from '../shared/process-steps'

/** OpenAI Chat Completions 多模态 content 片段 */
export type ChatCompletionContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } }

/** OpenAI Chat Completions 消息体（含 tool_calls） */
export interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | ChatCompletionContentPart[] | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
  name?: string
}

export interface ToolCallStatus {
  content: string
  toolName?: string
  targetPath?: string
  argumentsLength: number
  toolCallId?: string
  /** present_inline_demo 等：参数流中尚未闭合的 html 片段 */
  partialHtml?: string
  partialCaption?: string
  /** write_file / search_replace / apply_patch：尚未闭合的参数，供 tool_preview 占 live diff 槽 */
  partialToolArgs?: Record<string, unknown>
}

type StreamChatChunk = {
  type: 'delta' | 'reasoning' | 'tool_calls' | 'tool_status' | 'done'
  content?: string
  toolCalls?: ChatCompletionMessage['tool_calls']
  toolStatus?: ToolCallStatus
  finishReason?: string
}

/** 等待流式响应首包 */
const FIRST_CHUNK_MS = 45_000
/** 首包之后两包之间的最长间隔 */
const STREAM_IDLE_MS = 60_000
/** 连接建立超时（仅 TCP/握手） */
const CONNECT_MS = 30_000
const STREAM_TOTAL_MS = 600_000
const TOOL_STATUS_THROTTLE_MS = 700
/** 内联演示 HTML 流式预览更勤，才能「做多少显示多少」 */
const DEMO_PREVIEW_THROTTLE_MS = 100
/** 写入/补丁参数流：官方 PatchApplyUpdated 约 500ms 缓冲，首个 path 立刻出槽 */
const WRITE_PREVIEW_THROTTLE_MS = 500
const WRITE_PREVIEW_GROW_CHARS = 240
const WRITE_PREVIEW_TOOLS = new Set(['write_file', 'search_replace', 'apply_patch'])

/** 从设置中解析当前激活的 API 配置，缺失时抛错 */
export function getActiveProvider(settings: AppSettings): ProviderConfig {
  if (!settings.activeProviderId) {
    throw new Error('请先在设置 → 模型中选择要使用的 API')
  }
  const p = settings.providers.find((x) => x.id === settings.activeProviderId)
  if (!p) throw new Error('当前选中的模型 API 不存在，请重新选择')
  if (!p.apiKey) throw new Error('请先填写 API Key')
  return p
}

/** 将 Base URL 规范化为 OpenAI 兼容根路径（…/v1 或厂商等价前缀） */
export function resolveOpenAiRoot(baseUrl: string): string {
  let base = baseUrl.trim().replace(/\/$/, '')
  if (!base.startsWith('http')) base = `https://${base}`
  try {
    const u = new URL(base)
    const host = u.hostname.toLowerCase()
    if (host.includes('deepseek.com')) {
      return `${u.origin}/v1`
    }
    if (host.includes('bigmodel.cn') || host.includes('bigmodel.com')) {
      // Coding Plan: …/api/coding/paas/v4 ；通用: …/api/paas/v4
      if (base.endsWith('/chat/completions')) return base.replace(/\/chat\/completions$/, '')
      return base
    }
    if (host.includes('stepfun.com') || host.includes('step.ai')) {
      if (base.endsWith('/v1')) return base
      return `${u.origin}/v1`
    }
    if (base.endsWith('/chat/completions')) {
      return base.replace(/\/chat\/completions$/, '')
    }
    return base
  } catch {
    return base
  }
}

/** 将 Base URL 规范化为 /chat/completions 端点 */
export function resolveChatCompletionsUrl(baseUrl: string): string {
  const root = resolveOpenAiRoot(baseUrl)
  if (root.endsWith('/chat/completions')) return root
  return `${root}/chat/completions`
}

/** 将 Base URL 规范化为 /models 列表端点 */
export function resolveModelsUrl(baseUrl: string): string {
  const root = resolveOpenAiRoot(baseUrl)
  if (root.endsWith('/models')) return root
  return `${root}/models`
}

/** 官方 /models 返回的条目（精简） */
export interface ProviderModelInfo {
  id: string
  ownedBy?: string
  created?: number
}

/** 拉取 OpenAI 兼容的模型列表（自动跟官方更新） */
export async function listProviderModels(
  provider: ProviderConfig
): Promise<{ ok: boolean; models: ProviderModelInfo[]; message: string }> {
  if (!provider.apiKey?.trim()) {
    return { ok: false, models: [], message: '请先填写 API Key' }
  }
  if (!provider.baseUrl?.trim()) {
    return { ok: false, models: [], message: '请先填写 Base URL' }
  }

  const url = resolveModelsUrl(provider.baseUrl)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20_000)
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${provider.apiKey.trim()}`,
        'Content-Type': 'application/json'
      },
      signal: ctrl.signal
    })
    const text = await res.text()
    if (!res.ok) {
      let detail = text.slice(0, 240)
      try {
        const j = JSON.parse(text) as { error?: { message?: string }; message?: string }
        detail = j.error?.message || j.message || detail
      } catch {
        /* keep raw */
      }
      return {
        ok: false,
        models: [],
        message: `拉取模型失败 HTTP ${res.status}${detail ? `：${detail}` : ''}`
      }
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(text) as unknown
    } catch {
      return { ok: false, models: [], message: '模型列表返回不是合法 JSON' }
    }

    const rawList = extractModelsArray(parsed)
    const models = rawList
      .map((item) => normalizeModelEntry(item))
      .filter((m): m is ProviderModelInfo => Boolean(m?.id))
      .sort((a, b) => preferredModelSort(a.id, b.id))

    // 去重
    const seen = new Set<string>()
    const unique = models.filter((m) => {
      if (seen.has(m.id)) return false
      seen.add(m.id)
      return true
    })
    const listedIds = new Set(filterListedModels(
      provider.id,
      unique.map((m) => m.id)
    ))
    const filtered = unique.filter((m) => listedIds.has(m.id))

    if (filtered.length === 0) {
      return { ok: false, models: [], message: '接口未返回可用模型' }
    }
    return {
      ok: true,
      models: filtered,
      message: `已获取 ${filtered.length} 个模型`
    }
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      return { ok: false, models: [], message: '拉取模型超时' }
    }
    const friendly = formatFetchError(e, url)
    return {
      ok: false,
      models: [],
      message: friendly.message
    }
  } finally {
    clearTimeout(timer)
  }
}

function extractModelsArray(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed
  if (parsed && typeof parsed === 'object') {
    const o = parsed as Record<string, unknown>
    if (Array.isArray(o.data)) return o.data
    if (Array.isArray(o.models)) return o.models
    if (Array.isArray(o.items)) return o.items
  }
  return []
}

function normalizeModelEntry(item: unknown): ProviderModelInfo | null {
  if (typeof item === 'string' && item.trim()) {
    return { id: item.trim() }
  }
  if (!item || typeof item !== 'object') return null
  const o = item as Record<string, unknown>
  const id = typeof o.id === 'string' ? o.id.trim() : typeof o.model === 'string' ? o.model.trim() : ''
  if (!id) return null
  return {
    id,
    ownedBy: typeof o.owned_by === 'string' ? o.owned_by : undefined,
    created: typeof o.created === 'number' ? o.created : undefined
  }
}

/** 新模型优先：v4/pro/flash 等排前面，便于选择 */
function preferredModelSort(a: string, b: string): number {
  const score = (id: string) => {
    const s = id.toLowerCase()
    let n = 0
    if (/5\.6|4\.6|glm-5\.2|kimi-k3|kimi-k2\.7|grok-4\.6/.test(s)) n += 120
    if (/v4|4\.5|4-1|glm-5|kimi-k2|grok-4/.test(s)) n += 100
    if (/pro|plus|max|opus|sonnet/.test(s)) n += 20
    if (/flash|mini|fast|air|turbo/.test(s)) n += 10
    if (/chat$|reasoner$|legacy/.test(s)) n -= 50
    return n
  }
  const d = score(b) - score(a)
  if (d !== 0) return d
  return a.localeCompare(b)
}

/** 将 fetch 底层错误转为可读提示 */
function formatFetchError(err: unknown, url: string): Error {
  if (err instanceof Error && err.message === 'This operation was aborted') {
    return err
  }
  const cause =
    err instanceof Error && 'cause' in err && err.cause instanceof Error
      ? err.cause.message
      : err instanceof Error
        ? err.message
        : String(err)
  const lower = cause.toLowerCase()
  if (lower.includes('fetch failed') || lower.includes('econnrefused')) {
    return new Error(
      `无法连接 API（${url}）。请检查：1) Base URL 是否正确 2) 网络/代理 3) 设置 → 模型 → 测试连接`
    )
  }
  if (lower.includes('enotfound') || lower.includes('getaddrinfo')) {
    return new Error(`API 域名无法解析（${url}），请检查 Base URL`)
  }
  if (lower.includes('certificate') || lower.includes('ssl') || lower.includes('tls')) {
    return new Error(`API TLS/证书错误（${url}），请检查 Base URL 或系统时间`)
  }
  if (err instanceof Error) return err
  return new Error(String(err))
}

/** 非视觉模型请求前去掉 image_url，避免 API 报错或 fetch 异常 */
function sanitizeMessagesForProvider(
  messages: ChatCompletionMessage[],
  provider: ProviderConfig
): ChatCompletionMessage[] {
  const allowVision = inferProviderVision(provider)
  if (allowVision) return messages
  return messages.map((m) => {
    if (!Array.isArray(m.content)) return m
    const textParts = m.content
      .filter((p) => p.type === 'text')
      .map((p) => (p.type === 'text' ? p.text : ''))
      .join('\n')
    const hadImage = m.content.some((p) => p.type === 'image_url')
    const suffix = hadImage
      ? '\n[系统] 截图图像已省略（当前模型未开启视觉）。请在 设置 → 模型 中开启「视觉」或换 gpt-4o 等视觉模型。'
      : ''
    return { ...m, content: (textParts + suffix).trim() || null }
  })
}

/** 判断 API 响应是否因不支持 tools 而失败 */
function isToolUnsupportedError(status: number, body: string): boolean {
  if (status !== 400 && status !== 422) return false
  const lower = body.toLowerCase()
  return (
    lower.includes('tool') ||
    lower.includes('function') ||
    lower.includes('不支持') ||
    lower.includes('not support')
  )
}

/** HTTP 错误可读化（401 订阅过期等） */
function formatApiHttpError(status: number, body: string, provider: ProviderConfig): string {
  const snippet = body.slice(0, 400)
  if (status === 401 || status === 403) {
    if (provider.authMode === 'subscription' || provider.id === 'xai-grok') {
      return `API ${status} 未授权：订阅登录可能已过期。请打开 设置 → 模型 → ${provider.name || provider.id} 重新登录。${snippet ? `（${snippet}）` : ''}`
    }
    return `API ${status} 未授权：请检查 API Key 是否正确、是否过期。${snippet ? `（${snippet}）` : ''}`
  }
  if (status === 404) {
    return `API 404：模型「${provider.model}」可能不存在或 Base URL 不正确。${snippet ? `（${snippet}）` : ''}`
  }
  return `API ${status}: ${snippet}`
}

/** 发起单次 Chat Completions POST 请求 */
async function postChat(
  provider: ProviderConfig,
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<Response> {
  const url = resolveChatCompletionsUrl(provider.baseUrl)
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort)

  const connectTimer = setTimeout(() => controller.abort(), CONNECT_MS)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    })
    clearTimeout(connectTimer)
    return res
  } catch (e) {
    clearTimeout(connectTimer)
    if (controller.signal.aborted && !signal?.aborted) {
      throw new Error(`连接 API 超时（${CONNECT_MS / 1000}s），请检查 Base URL 与网络`)
    }
    throw formatFetchError(e, url)
  } finally {
    signal?.removeEventListener('abort', onAbort)
  }
}

/** 带截止时间的 ReadableStream 读取，超时则取消 */
async function readWithDeadline(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  deadlineMs: number,
  message: string
): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          void reader.cancel()
          reject(new Error(message))
        }, Math.max(1, deadlineMs))
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** 读流时同时响应 AbortSignal，避免 Stop 后仍卡在 idle 等待 */
async function readWithDeadlineOrAbort(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  deadlineMs: number,
  message: string,
  signal?: AbortSignal
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal?.aborted) {
    try {
      await reader.cancel()
    } catch {
      /* ignore */
    }
    throw new DOMException('This operation was aborted', 'AbortError')
  }
  if (!signal) {
    return readWithDeadline(reader, deadlineMs, message)
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  let onAbort: (() => void) | undefined
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          void reader.cancel()
          reject(new Error(message))
        }, Math.max(1, deadlineMs))
      }),
      new Promise<never>((_, reject) => {
        onAbort = () => {
          void reader.cancel()
          reject(new DOMException('This operation was aborted', 'AbortError'))
        }
        signal.addEventListener('abort', onAbort, { once: true })
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
    if (onAbort) signal.removeEventListener('abort', onAbort)
  }
}

/** 从 SSE delta 提取推理/思考字段 */
function extractReasoning(delta: Record<string, unknown> | undefined): string {
  if (!delta) return ''
  return (
    (typeof delta.reasoning_content === 'string' && delta.reasoning_content) ||
    (typeof delta.reasoning === 'string' && delta.reasoning) ||
    (typeof delta.thought === 'string' && delta.thought) ||
    ''
  )
}

/** 从 SSE delta 提取正文 content */
function extractDeltaContent(delta: Record<string, unknown> | undefined): string {
  if (!delta) return ''
  if (typeof delta.content === 'string') return delta.content
  const message = delta.message as { content?: string } | undefined
  if (typeof message?.content === 'string') return message.content
  return ''
}

/**
 * 厂商额外请求字段：
 * - 官方思考水平（DeepSeek / Grok / OpenAI o 系 / Kimi / 智谱）
 * - StepFun 默认压低 reasoning，避免首轮卡住
 */
function providerExtraBody(provider: ProviderConfig): Record<string, unknown> {
  const extra: Record<string, unknown> = {
    ...buildThinkingRequestFields(provider)
  }
  try {
    let base = provider.baseUrl.trim()
    if (!base.startsWith('http')) base = `https://${base}`
    const host = new URL(base).hostname.toLowerCase()
    if (host.includes('stepfun.com') || host.includes('step.ai')) {
      // 未单独配置思考水平时，Step 默认 low
      if (extra.reasoning_effort == null && extra.thinking == null) {
        extra.reasoning_effort = 'low'
      }
    }
  } catch {
    /* ignore */
  }
  return extra
}

function basenamePath(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  return normalized.split('/').filter(Boolean).pop() || path
}

/** 反转义 JSON 字符串片段（含流式未闭合串） */
function unescapeJsonStringFragment(value: string): string {
  try {
    // 完整合法片段
    return JSON.parse(`"${value}"`) as string
  } catch {
    /* 尾部可能截断，走手工 */
  }
  let out = ''
  for (let i = 0; i < value.length; i++) {
    const c = value[i]
    if (c !== '\\' || i + 1 >= value.length) {
      out += c
      continue
    }
    const n = value[i + 1]
    if (n === 'n') out += '\n'
    else if (n === 't') out += '\t'
    else if (n === 'r') out += '\r'
    else if (n === '"' || n === '\\' || n === '/') out += n
    else if (n === 'u' && i + 5 < value.length) {
      const hex = value.slice(i + 2, i + 6)
      if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        out += String.fromCharCode(Number.parseInt(hex, 16))
        i += 5
        continue
      }
      out += n
    } else out += n
    i++
  }
  return out
}

/**
 * 从（可能未闭合的）JSON 参数串中抽出字符串字段。
 * 比正则更稳：大块 HTML、转义引号、流式截断都能拿到「目前为止」的内容。
 */
function extractPartialJsonString(args: string, keys: string[]): string | undefined {
  for (const key of keys) {
    const marker = `"${key}"`
    let keyAt = args.indexOf(marker)
    if (keyAt < 0) continue
    let i = keyAt + marker.length
    while (i < args.length && /\s/.test(args[i]!)) i++
    if (args[i] !== ':') continue
    i++
    while (i < args.length && /\s/.test(args[i]!)) i++
    if (args[i] !== '"') continue
    i++ // opening quote
    let raw = ''
    while (i < args.length) {
      const c = args[i]!
      if (c === '\\') {
        if (i + 1 >= args.length) {
          // 转义未写完，丢掉尾反斜杠
          break
        }
        raw += c + args[i + 1]!
        i += 2
        continue
      }
      if (c === '"') break
      raw += c
      i++
    }
    if (raw.length > 0) return unescapeJsonStringFragment(raw)
  }
  return undefined
}

function extractToolTargetPath(toolName: string | undefined, args: string): string | undefined {
  if (!args) return undefined
  const fromJson = extractPartialJsonString(args, ['path', 'file_path', 'target_path'])
  if (fromJson) return fromJson
  if (toolName === 'apply_patch') {
    const patch = extractPartialJsonString(args, ['patch']) ?? args
    const match = patch.match(/\*\*\* (?:Add|Update) File:\s*([^\n\r*]+)/)
    return match?.[1]?.trim()
  }
  return undefined
}

function inferWriteToolName(toolName: string | undefined, args: string): string | undefined {
  if (toolName && WRITE_PREVIEW_TOOLS.has(toolName)) return toolName
  if (toolName) return undefined
  if (/"old_string"\s*:/.test(args) || /"new_string"\s*:/.test(args)) return 'search_replace'
  if (/"patch"\s*:/.test(args) || /\*\*\* (?:Add|Update) File:/.test(args)) return 'apply_patch'
  if (/"content"\s*:/.test(args) && /"(?:path|file_path)"\s*:/.test(args) && !/"html"\s*:/.test(args)) {
    return 'write_file'
  }
  return undefined
}

/** 从尚未闭合的 tool JSON 抽出写入/补丁参数（不编造 diff 行） */
export function extractPartialWriteToolArgs(
  toolName: string | undefined,
  args: string
): Record<string, unknown> | undefined {
  const writeName = inferWriteToolName(toolName, args)
  if (!writeName || !args) return undefined
  const out: Record<string, unknown> = {}
  const path = extractToolTargetPath(writeName, args)
  if (path) out.path = path
  if (writeName === 'write_file') {
    const content = extractPartialJsonString(args, ['content'])
    if (content != null) out.content = content
  } else if (writeName === 'search_replace') {
    const oldString = extractPartialJsonString(args, ['old_string'])
    const newString = extractPartialJsonString(args, ['new_string'])
    if (oldString != null) out.old_string = oldString
    if (newString != null) out.new_string = newString
  } else if (writeName === 'apply_patch') {
    const patch = extractPartialJsonString(args, ['patch'])
    if (patch != null) out.patch = patch
    else {
      const start = args.indexOf('*** ')
      if (start >= 0) out.patch = args.slice(start)
    }
  }
  return Object.keys(out).length ? out : undefined
}

function toolStatusFromAccum(
  toolCallsAccum: Record<number, { id: string; name: string; arguments: string }>
): ToolCallStatus | undefined {
  const calls = Object.values(toolCallsAccum)
  if (calls.length === 0) return undefined
  const active = calls[calls.length - 1]
  let toolName = active.name || undefined
  const args = active.arguments
  // 名称可能比 arguments 晚到：凭参数形态识别内联演示
  const partialHtml = extractPartialJsonString(args, ['html'])
  const partialCaption = extractPartialJsonString(args, ['caption'])
  const isDemo =
    toolName === 'present_inline_demo' ||
    (Boolean(partialHtml) && /"html"\s*:/.test(args)) ||
    /present_inline_demo/.test(args)
  if (isDemo && !toolName) toolName = 'present_inline_demo'
  if (!isDemo && !toolName) {
    const inferredWrite = inferWriteToolName(undefined, args)
    if (inferredWrite) toolName = inferredWrite
  }

  const targetPath = extractToolTargetPath(toolName, args)
  const partialToolArgs = isDemo ? undefined : extractPartialWriteToolArgs(toolName, args)
  const target = targetPath ? basenamePath(targetPath) : ''
  const argumentsLength = calls.reduce((sum, call) => sum + call.arguments.length, 0)

  let content = '正在准备下一步'
  if (isDemo) {
    const n = partialHtml?.length ?? 0
    content = n > 0 ? `正在生成交互演示… ${n.toLocaleString()} 字符` : '正在生成交互演示…'
  } else if (toolName === 'write_file') {
    content = target ? `正在生成 ${target} 的写入内容` : '正在生成写入内容'
  } else if (toolName === 'apply_patch' || toolName === 'search_replace') {
    content = target ? `正在整理 ${target} 的修改` : '正在整理文件修改'
  } else if (toolName === 'run_terminal_cmd') {
    content = '正在准备运行命令'
  } else if (toolName === 'read_file') {
    content = target ? `正在准备读取 ${target}` : '正在准备读取文件'
  } else if (toolName) {
    // 中文工具名，避免直播区出现 raw toolName
    content = `正在准备${toolTitle(toolName)}`
  }

  return {
    content,
    toolName,
    targetPath,
    argumentsLength,
    toolCallId: active.id || undefined,
    partialHtml: isDemo ? partialHtml : undefined,
    partialCaption: isDemo ? partialCaption : undefined,
    partialToolArgs
  }
}

/** 单次流式请求：SSE 解析、推理/正文/tool_calls 分片累积、空闲超时 */
async function* streamChatAttempt(
  settings: AppSettings,
  messages: ChatCompletionMessage[],
  signal: AbortSignal | undefined,
  withTools: boolean,
  toolDefs: typeof TOOL_DEFINITIONS = TOOL_DEFINITIONS
): AsyncGenerator<StreamChatChunk> {
  const provider = getActiveProvider(settings)
  const apiMessages = sanitizeMessagesForProvider(messages, provider)
  const baseBody = {
    model: provider.model,
    messages: apiMessages,
    stream: true,
    ...providerExtraBody(provider)
  }

  let res = await postChat(
    provider,
    withTools ? { ...baseBody, tools: toolDefs, tool_choice: 'auto' } : baseBody,
    signal
  )

  if (!res.ok) {
    const text = await res.text()
    // 部分兼容 API 不支持 tools，400/422 时降级为普通对话
    if (withTools && isToolUnsupportedError(res.status, text)) {
      res = await postChat(provider, baseBody, signal)
      if (!res.ok) {
        const retryText = await res.text()
        throw new Error(formatApiHttpError(res.status, retryText, provider))
      }
    } else {
      throw new Error(formatApiHttpError(res.status, text, provider))
    }
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''
  const toolCallsAccum: Record<number, { id: string; name: string; arguments: string }> = {}
  const requestStartedAt = Date.now()
  let lastChunkAt = requestStartedAt
  let receivedChunk = false
  let lastToolStatusAt = 0
  let lastDemoHtmlLen = 0
  let lastWriteArgsLen = 0
  let lastWritePath = ''

  try {
    // 读 SSE 流：首包与空闲分别计时，解析 data: 行并累积 tool_calls 片段
    while (true) {
      // 用户 Stop / 超时 abort：立刻结束，避免 turnChain 被挂死的 fetch 卡住
      if (signal?.aborted) {
        try {
          await reader.cancel()
        } catch {
          /* ignore */
        }
        throw new DOMException('This operation was aborted', 'AbortError')
      }

      if (Date.now() - requestStartedAt > STREAM_TOTAL_MS) {
        throw new Error('模型响应超时（总时长超过 10 分钟）')
      }

      const waitMs = receivedChunk ? STREAM_IDLE_MS : FIRST_CHUNK_MS
      const since = receivedChunk ? lastChunkAt : requestStartedAt
      const remaining = waitMs - (Date.now() - since)
      if (remaining <= 0) {
        throw new Error(
          receivedChunk
            ? `模型 ${STREAM_IDLE_MS / 1000} 秒无新输出，已中断`
            : `模型 ${FIRST_CHUNK_MS / 1000} 秒内无响应，请检查 API 地址、Key 与模型 ID`
        )
      }

      const timeoutMsg = receivedChunk
        ? `模型 ${STREAM_IDLE_MS / 1000} 秒无新输出，请检查 API 或换用兼容模型`
        : `模型 ${FIRST_CHUNK_MS / 1000} 秒内无响应，请检查 API 地址、Key 与模型 ID`

      // abort 与读流竞速：Stop 时不必等 idle 超时
      const { done, value } = await readWithDeadlineOrAbort(reader, remaining, timeoutMsg, signal)

      lastChunkAt = Date.now()
      if (!done && value && value.length > 0) {
        receivedChunk = true
      }

      if (done) {
        if (Object.keys(toolCallsAccum).length > 0) {
          const toolCalls = Object.values(toolCallsAccum).map((t) => ({
            id: t.id,
            type: 'function' as const,
            function: { name: t.name, arguments: t.arguments }
          }))
          yield { type: 'tool_calls', toolCalls }
        }
        yield { type: 'done' }
        return
      }

      if (value?.length) {
        buffer += decoder.decode(value, { stream: true })
      }
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const data = trimmed.slice(5).trim()
        if (data === '[DONE]') {
          yield { type: 'done' }
          return
        }
        try {
          const json = JSON.parse(data)
          const choice = json.choices?.[0]
          if (!choice) continue
          const delta = choice.delta as Record<string, unknown> | undefined
          const reasoning = extractReasoning(delta)
          if (reasoning) {
            receivedChunk = true
            yield { type: 'reasoning', content: reasoning }
          }
          const content = extractDeltaContent(delta)
          if (content) {
            receivedChunk = true
            yield { type: 'delta', content }
          }
          if (delta?.tool_calls) {
            receivedChunk = true
            for (const tc of delta.tool_calls as Array<{
              index?: number
              id?: string
              function?: { name?: string; arguments?: string }
            }>) {
              const idx = tc.index ?? 0
              if (!toolCallsAccum[idx]) {
                toolCallsAccum[idx] = { id: tc.id ?? '', name: '', arguments: '' }
              }
              if (tc.id) toolCallsAccum[idx].id = tc.id
              if (tc.function?.name) toolCallsAccum[idx].name = tc.function.name
              if (tc.function?.arguments) toolCallsAccum[idx].arguments += tc.function.arguments
            }
            const status = toolStatusFromAccum(toolCallsAccum)
            const now = Date.now()
            const htmlLen = status?.partialHtml?.length ?? 0
            const demoHtmlGrew = htmlLen > 0 && htmlLen - lastDemoHtmlLen >= 40
            const isDemoStatus = status?.toolName === 'present_inline_demo'
            const isWriteStatus = Boolean(status?.toolName && WRITE_PREVIEW_TOOLS.has(status.toolName))
            const writeArgsLen = status?.partialToolArgs
              ? JSON.stringify(status.partialToolArgs).length
              : 0
            const writeGrew = isWriteStatus && writeArgsLen - lastWriteArgsLen >= WRITE_PREVIEW_GROW_CHARS
            const writePathFirst =
              isWriteStatus && Boolean(status?.targetPath) && lastWritePath === ''
            const throttleMs = isDemoStatus
              ? DEMO_PREVIEW_THROTTLE_MS
              : isWriteStatus
                ? WRITE_PREVIEW_THROTTLE_MS
                : TOOL_STATUS_THROTTLE_MS
            // 演示 / 写入：参数每涨一段就推；其它工具保持原节流
            const due =
              status &&
              (lastToolStatusAt === 0 ||
                now - lastToolStatusAt >= throttleMs ||
                (isDemoStatus && demoHtmlGrew) ||
                (isDemoStatus && htmlLen > 0 && lastDemoHtmlLen === 0) ||
                writePathFirst ||
                writeGrew)
            if (due && status) {
              lastToolStatusAt = now
              if (isDemoStatus) lastDemoHtmlLen = htmlLen
              if (isWriteStatus) {
                lastWriteArgsLen = writeArgsLen
                lastWritePath = status.targetPath ?? lastWritePath
              }
              yield {
                type: 'tool_status',
                content: status.content,
                toolStatus: status
              }
            }
          }
          if (choice.finish_reason === 'tool_calls') {
            const toolCalls = Object.values(toolCallsAccum).map((t) => ({
              id: t.id,
              type: 'function' as const,
              function: { name: t.name, arguments: t.arguments }
            }))
            yield { type: 'tool_calls', toolCalls }
          }
          if (choice.finish_reason === 'stop') {
            yield { type: 'done', finishReason: 'stop' }
          }
        } catch {
          /* skip malformed */
        }
      }
    }
  } finally {
    try {
      reader.releaseLock()
    } catch {
      /* already released */
    }
  }
}

/** 流式对话入口：优先带 tools 请求，超时后可降级为无工具重试 */
export async function* streamChat(
  settings: AppSettings,
  messages: ChatCompletionMessage[],
  signal?: AbortSignal,
  options?: { preferTools?: boolean; toolDefinitions?: typeof TOOL_DEFINITIONS }
): AsyncGenerator<StreamChatChunk> {
  const preferTools = options?.preferTools !== false
  const tools = options?.toolDefinitions ?? getToolDefinitionsForPhase()

  try {
    yield* streamChatAttempt(settings, messages, signal, preferTools, tools)
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e))
  }
}

/** 非流式单次补全（用于标题生成等轻量任务） */
export async function simpleCompletion(
  settings: AppSettings,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const provider = getActiveProvider(settings)
  const res = await postChat(
    provider,
    {
      model: provider.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      stream: false,
      max_tokens: 800,
      ...providerExtraBody(provider)
    },
    undefined
  )
  if (!res.ok) throw new Error(`API ${res.status}`)
  const json = await res.json()
  return json.choices?.[0]?.message?.content?.trim() ?? ''
}

/** 测试单个 Provider 配置的连通性 */
export async function testProviderConfig(
  provider: ProviderConfig
): Promise<{ ok: boolean; message: string }> {
  try {
    if (!provider.apiKey) return { ok: false, message: '请先填写 API Key' }
    if (!provider.model?.trim()) return { ok: false, message: '请先填写模型 ID' }

    const extra = providerExtraBody(provider)
    const res = await postChat(
      provider,
      {
        model: provider.model,
        messages: [{ role: 'user', content: 'ping' }],
        stream: false,
        max_tokens: 8,
        ...extra
      },
      undefined
    )
    if (!res.ok) {
      const text = await res.text()
      return { ok: false, message: `API ${res.status}: ${text.slice(0, 240)}` }
    }

    const streamRes = await postChat(
      provider,
      {
        model: provider.model,
        messages: [{ role: 'user', content: '回复 ok' }],
        stream: true,
        max_tokens: 16,
        ...extra
      },
      undefined
    )
    if (!streamRes.ok) {
      const text = await streamRes.text()
      return {
        ok: true,
        message: `对话接口连接成功（流式 ${streamRes.status}，真实对话可能较慢）: ${text.slice(0, 120)}`
      }
    }

    const reader = streamRes.body?.getReader()
    if (!reader) {
      return { ok: true, message: '对话接口连接成功（无流式 body）' }
    }

    const decoder = new TextDecoder()
    let buffer = ''
    const started = Date.now()
    const streamWaitMs = 20_000
    let gotData = false

    while (Date.now() - started < streamWaitMs) {
      const { done, value } = await readWithDeadline(
        reader,
        streamWaitMs - (Date.now() - started),
        '流式测试超时'
      )
      if (done) break
      if (value?.length) {
        buffer += decoder.decode(value, { stream: true })
        if (buffer.includes('data:') && !buffer.includes('data: [DONE]')) {
          gotData = true
          break
        }
      }
    }

    try {
      reader.releaseLock()
    } catch {
      /* ignore */
    }

    if (!gotData) {
      return {
        ok: true,
        message:
          '对话接口连接成功，但 20 秒内未收到流式输出。Agent 任务可能长时间显示「思考中」，可换更快模型或检查 Base URL'
      }
    }

    return { ok: true, message: '对话接口连接成功（含流式）' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

/** 按 ID 从设置中查找 Provider 并测试 */
export async function testProvider(
  settings: AppSettings,
  providerId?: string
): Promise<{ ok: boolean; message: string }> {
  const id = providerId ?? settings.activeProviderId
  const provider = settings.providers.find((p) => p.id === id)
  if (!provider) return { ok: false, message: '未找到该 API 配置' }
  return testProviderConfig(provider)
}
