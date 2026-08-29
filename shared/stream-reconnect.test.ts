import { describe, expect, it } from 'vitest'
import {
  STREAM_RECONNECT_MAX,
  isTransientStreamError,
  isUserStreamAbort,
  retryTransientStreamChat,
  streamChunkStartsVisibleOutput,
  streamReconnectDelayMs,
  isReconnectLiveStatus,
  resolveReconnectLiveStatus,
  streamReconnectLiveStatus
} from './stream-reconnect'

describe('stream reconnect policy', () => {
  it('retries transient outages before visible output and keeps Stop / auth / streamed tokens honest', async () => {
    expect(STREAM_RECONNECT_MAX).toBe(5)
    expect(streamReconnectLiveStatus(1)).toBe('Reconnecting... 1/5')
    expect(streamReconnectLiveStatus(5)).toBe('Reconnecting... 5/5')
    expect(streamReconnectLiveStatus(9)).toBe('Reconnecting... 5/5')
    expect(isReconnectLiveStatus('Reconnecting... 2/5')).toBe(true)
    expect(isReconnectLiveStatus('正在重新连接… 3/5')).toBe(true)
    expect(isReconnectLiveStatus('Working')).toBe(false)
    expect(resolveReconnectLiveStatus('正在重新连接… 3/5')).toBe('Reconnecting... 3/5')
    expect(resolveReconnectLiveStatus('Reconnecting... 4/5')).toBe('Reconnecting... 4/5')
    expect(streamReconnectDelayMs(1)).toBe(400)
    expect(streamReconnectDelayMs(4)).toBe(3200)
    expect(isTransientStreamError(new Error('API 429: rate limit'))).toBe(true)
    expect(isTransientStreamError(new Error('API 503: overloaded'))).toBe(true)
    expect(isTransientStreamError(new Error('连接 API 超时（30s），请检查 Base URL 与网络'))).toBe(true)
    expect(isTransientStreamError(new Error('模型 45 秒内无响应，请检查 API 地址、Key 与模型 ID'))).toBe(true)
    expect(isTransientStreamError(new Error('模型 60 秒无新输出，已中断'))).toBe(true)
    expect(isTransientStreamError(new Error('fetch failed'))).toBe(true)
    expect(isTransientStreamError(new Error('API 401 未授权：请检查 API Key'))).toBe(false)
    expect(isTransientStreamError(new Error('API 域名无法解析（https://x），请检查 Base URL'))).toBe(false)
    expect(isTransientStreamError(new Error('模型响应超时（总时长超过 10 分钟）'))).toBe(false)
    const stopped = new DOMException('This operation was aborted', 'AbortError')
    expect(isUserStreamAbort(stopped)).toBe(true)
    expect(isTransientStreamError(stopped)).toBe(false)
    const userAbort = new AbortController()
    userAbort.abort()
    expect(isTransientStreamError(new Error('API 502: bad gateway'), userAbort.signal)).toBe(false)
    expect(streamChunkStartsVisibleOutput({ type: 'delta' })).toBe(true)
    expect(streamChunkStartsVisibleOutput({ type: 'status' })).toBe(false)

    const sleeps: number[] = []
    async function* failTwiceThenDone(): AsyncGenerator<{ type: string; content?: string }> {
      const n = (failTwiceThenDone as { tries?: number }).tries ?? 0
      ;(failTwiceThenDone as { tries?: number }).tries = n + 1
      if (n < 2) throw new Error('API 502: bad gateway')
      yield { type: 'delta', content: 'ok' }
      yield { type: 'done' }
    }
    const out: Array<{ type: string; content?: string }> = []
    for await (const chunk of retryTransientStreamChat(failTwiceThenDone, undefined, {
      sleep: async (ms) => {
        sleeps.push(ms)
      }
    })) {
      out.push(chunk)
    }
    expect(out.map((c) => c.content)).toEqual(['Reconnecting... 1/5', 'Reconnecting... 2/5', 'ok', undefined])
    expect(sleeps).toEqual([400, 800])

    async function* alreadyStreaming(): AsyncGenerator<{ type: string; content?: string }> {
      yield { type: 'delta', content: 'hi' }
      throw new Error('API 503: overloaded')
    }
    await expect(async () => {
      for await (const _ of retryTransientStreamChat(alreadyStreaming, undefined, { sleep: async () => {} })) {
        /* drain */
      }
    }).rejects.toThrow('API 503: overloaded')
  })
})
