/**
 * 直播回合在供应商短暂中断时重试同一请求（对标 Codex #37337 Turns reconnect）。
 * 已吐出正文 / 思考 / 工具参数后不再重开，避免直播行重复。
 */

/** 官方桌面 Reconnecting 1/5 … 5/5 */
export const STREAM_RECONNECT_MAX = 5

export function streamReconnectLiveStatus(
  attempt: number,
  max = STREAM_RECONNECT_MAX
): string {
  const n = Math.max(1, Math.min(Math.floor(attempt), max))
  return `正在重新连接… ${n}/${max}`
}

/** 第 1 次重连等 400ms，之后倍增，封顶 3.2s */
export function streamReconnectDelayMs(attempt: number): number {
  return Math.min(400 * 2 ** Math.max(0, attempt - 1), 3200)
}

export function isUserStreamAbort(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true
  if (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError') {
    return true
  }
  return (
    err instanceof Error &&
    (err.name === 'AbortError' || err.message === 'This operation was aborted')
  )
}

/** 可重试的短暂中断：5xx / 429 / 连不上 / 首包与空闲超时。鉴权、DNS、证书、用户 Stop 不重试。 */
export function isTransientStreamError(err: unknown, signal?: AbortSignal): boolean {
  if (isUserStreamAbort(err, signal)) return false
  const msg = err instanceof Error ? err.message : String(err)
  if (/API (401|403|404)\b/.test(msg)) return false
  if (/TLS|证书|域名无法解析/.test(msg)) return false
  if (/总时长超过/.test(msg)) return false
  if (/API (429|502|503|504)\b/.test(msg)) return true
  if (/连接 API 超时|无法连接 API|秒内无响应|秒无新输出/.test(msg)) return true
  if (/econnreset|econnrefused|etimedout|fetch failed|socket|und_err/i.test(msg)) return true
  if (/overloaded|high demand|temporarily unavailable|rate limit|try again later/i.test(msg)) {
    return true
  }
  return false
}

export function streamChunkStartsVisibleOutput(chunk: { type: string }): boolean {
  return (
    chunk.type === 'delta' ||
    chunk.type === 'reasoning' ||
    chunk.type === 'tool_calls' ||
    chunk.type === 'tool_status'
  )
}

export async function sleepAbortable(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return
  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('This operation was aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('This operation was aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

type StreamRetryChunk = { type: string; content?: string }

/** 首包前短暂失败最多重连 5 次，并产出直播 status。已有可见输出则原样抛出。 */
export async function* retryTransientStreamChat<T extends StreamRetryChunk>(
  startAttempt: () => AsyncGenerator<T>,
  signal?: AbortSignal,
  opts?: { sleep?: (ms: number, signal?: AbortSignal) => Promise<void> }
): AsyncGenerator<T> {
  const sleep = opts?.sleep ?? sleepAbortable
  let lastError: unknown

  for (let reconnect = 0; reconnect <= STREAM_RECONNECT_MAX; reconnect++) {
    if (signal?.aborted) {
      throw new DOMException('This operation was aborted', 'AbortError')
    }
    let yieldedVisible = false
    try {
      for await (const chunk of startAttempt()) {
        if (streamChunkStartsVisibleOutput(chunk)) yieldedVisible = true
        yield chunk
      }
      return
    } catch (e) {
      lastError = e
      const canRetry =
        !yieldedVisible &&
        reconnect < STREAM_RECONNECT_MAX &&
        isTransientStreamError(e, signal)
      if (!canRetry) {
        throw e instanceof Error ? e : new Error(String(e))
      }
      yield {
        type: 'status',
        content: streamReconnectLiveStatus(reconnect + 1)
      } as T
      await sleep(streamReconnectDelayMs(reconnect + 1), signal)
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? 'stream reconnect exhausted'))
}
