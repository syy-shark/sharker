/**
 * OpenAI 兼容 Chat Completions 客户端：流式输出、工具调用、超时与降级重试。
 * @see providers/README.md
 */
import type { AppSettings, ProviderConfig } from '../shared/types'
import { TOOL_DEFINITIONS } from '../agent/tool-definitions'

/** OpenAI Chat Completions 消息体（含 tool_calls） */
export interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
  name?: string
}

/** 等待流式响应首包 */
const FIRST_CHUNK_MS = 45_000
/** 首包之后两包之间的最长间隔 */
const STREAM_IDLE_MS = 60_000
/** 连接建立超时（仅 TCP/握手） */
const CONNECT_MS = 30_000
const STREAM_TOTAL_MS = 600_000

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

/** 将 Base URL 规范化为 /chat/completions 端点 */
export function resolveChatCompletionsUrl(baseUrl: string): string {
  let base = baseUrl.trim().replace(/\/$/, '')
  if (!base.startsWith('http')) base = `https://${base}`
  try {
    const u = new URL(base)
    const host = u.hostname.toLowerCase()
    if (host.includes('deepseek.com')) {
      return `${u.origin}/v1/chat/completions`
    }
    if (base.endsWith('/v1')) {
      return `${base}/chat/completions`
    }
    return `${base}/chat/completions`
  } catch {
    return `${base}/chat/completions`
  }
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
    throw e
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

/** 单次流式请求：SSE 解析、推理/正文/tool_calls 分片累积、空闲超时 */
async function* streamChatAttempt(
  settings: AppSettings,
  messages: ChatCompletionMessage[],
  signal: AbortSignal | undefined,
  withTools: boolean
): AsyncGenerator<{
  type: 'delta' | 'reasoning' | 'tool_calls' | 'done'
  content?: string
  toolCalls?: ChatCompletionMessage['tool_calls']
  finishReason?: string
}> {
  const provider = getActiveProvider(settings)
  const baseBody = {
    model: provider.model,
    messages,
    stream: true
  }

  let res = await postChat(
    provider,
    withTools ? { ...baseBody, tools: TOOL_DEFINITIONS, tool_choice: 'auto' } : baseBody,
    signal
  )

  if (!res.ok) {
    const text = await res.text()
    // 部分兼容 API 不支持 tools，400/422 时降级为普通对话
    if (withTools && isToolUnsupportedError(res.status, text)) {
      res = await postChat(provider, baseBody, signal)
      if (!res.ok) {
        const retryText = await res.text()
        throw new Error(`API ${res.status}: ${retryText.slice(0, 400)}`)
      }
    } else {
      throw new Error(`API ${res.status}: ${text.slice(0, 400)}`)
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

  try {
    // 读 SSE 流：首包与空闲分别计时，解析 data: 行并累积 tool_calls 片段
    while (true) {
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

      const { done, value } = await readWithDeadline(reader, remaining, timeoutMsg)

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
  options?: { preferTools?: boolean }
): AsyncGenerator<{
  type: 'delta' | 'reasoning' | 'tool_calls' | 'done'
  content?: string
  toolCalls?: ChatCompletionMessage['tool_calls']
  finishReason?: string
}> {
  const preferTools = options?.preferTools !== false

  try {
    yield* streamChatAttempt(settings, messages, signal, preferTools)
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
      max_tokens: 800
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

    const res = await postChat(
      provider,
      {
        model: provider.model,
        messages: [{ role: 'user', content: 'ping' }],
        stream: false,
        max_tokens: 8
      },
      undefined
    )
    if (res.ok) return { ok: true, message: '对话接口连接成功' }
    const text = await res.text()
    return { ok: false, message: `API ${res.status}: ${text.slice(0, 240)}` }
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
