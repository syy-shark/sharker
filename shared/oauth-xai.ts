/**
 * xAI SuperGrok / X Premium+ 订阅：OAuth 2.0 Device Code 登录。
 *
 * 流程对齐官方 Grok CLI / Hermes：
 * 1) POST auth.x.ai/oauth2/device/code → user_code + device_code
 * 2) 打开 accounts.x.ai/oauth2/device?user_code=XXXX（不是账户设置页）
 * 3) 轮询 auth.x.ai/oauth2/token 直到授权完成
 *
 * client_id 复用公开的 Grok CLI 公共客户端（与 CC Switch / 社区工具一致）。
 */
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

/** 公开 Grok CLI OAuth client（device code，无 secret） */
export const XAI_OAUTH_CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828'

/** 订阅访问所需 scope */
export const XAI_OAUTH_SCOPE = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'api:access',
  'grok-cli:access'
].join(' ')

const DEVICE_CODE_URL = 'https://auth.x.ai/oauth2/device/code'
const TOKEN_URL = 'https://auth.x.ai/oauth2/token'

export interface OAuthXaiConfig {
  connected: boolean
  email?: string
  accessTokenEnc?: string
  refreshTokenEnc?: string
  expiresAt?: string
  /** 明文仅运行时短暂持有，不写盘 */
  accessToken?: string
  refreshToken?: string
}

export interface XaiDeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  verification_uri_complete?: string
  expires_in: number
  interval?: number
}

export interface XaiTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  scope?: string
}

export interface XaiDeviceStartResult {
  ok: boolean
  message: string
  userCode?: string
  /** 应打开的完整 URL（含 user_code） */
  verificationUri?: string
  deviceCode?: string
  intervalSec?: number
  expiresIn?: number
}

export interface XaiDeviceWaitResult {
  ok: boolean
  message: string
  accessToken?: string
  refreshToken?: string
  expiresAt?: string
}

export type TokenEncryptFn = (plain: string) => string

function metaPath(): string {
  return path.join(os.homedir(), '.sharker', 'oauth-xai.json')
}

export async function loadOAuthXaiMeta(): Promise<OAuthXaiConfig> {
  try {
    const raw = await fs.readFile(metaPath(), 'utf8')
    return JSON.parse(raw) as OAuthXaiConfig
  } catch {
    return { connected: false }
  }
}

export async function saveOAuthXaiMeta(meta: OAuthXaiConfig): Promise<void> {
  const dir = path.dirname(metaPath())
  await fs.mkdir(dir, { recursive: true })
  // 不把明文 token 写进 json（仅 enc）
  const { accessToken: _a, refreshToken: _r, ...safe } = meta
  await fs.writeFile(metaPath(), JSON.stringify(safe, null, 2), 'utf8')
}

/** 申请设备码（user_code 给用户在浏览器输入/确认） */
export async function startXaiDeviceCode(): Promise<XaiDeviceStartResult> {
  try {
    const body = new URLSearchParams({
      client_id: XAI_OAUTH_CLIENT_ID,
      scope: XAI_OAUTH_SCOPE
    })
    const res = await fetch(DEVICE_CODE_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    })
    const text = await res.text()
    if (!res.ok) {
      return {
        ok: false,
        message: `申请设备码失败 HTTP ${res.status}：${text.slice(0, 200)}`
      }
    }
    let data: XaiDeviceCodeResponse
    try {
      data = JSON.parse(text) as XaiDeviceCodeResponse
    } catch {
      return { ok: false, message: '设备码响应不是 JSON' }
    }
    if (!data.device_code || !data.user_code) {
      return { ok: false, message: '设备码响应缺少 device_code / user_code' }
    }

    // 用户期望的形态：accounts.x.ai/oauth2/device?user_code=XXXX
    const verificationUri =
      data.verification_uri_complete?.trim() ||
      (data.verification_uri
        ? `${data.verification_uri}${data.verification_uri.includes('?') ? '&' : '?'}user_code=${encodeURIComponent(data.user_code)}`
        : `https://accounts.x.ai/oauth2/device?user_code=${encodeURIComponent(data.user_code)}`)

    return {
      ok: true,
      message: `请在浏览器确认代码 ${data.user_code}`,
      userCode: data.user_code,
      verificationUri,
      deviceCode: data.device_code,
      intervalSec: Math.max(3, data.interval ?? 5),
      expiresIn: data.expires_in ?? 900
    }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e)
    }
  }
}

/**
 * 轮询换 token，直到用户在浏览器点允许，或超时。
 * 标准错误：authorization_pending / slow_down / expired_token / access_denied
 */
export async function waitXaiDeviceToken(
  deviceCode: string,
  opts?: { intervalSec?: number; expiresIn?: number; signal?: AbortSignal }
): Promise<XaiDeviceWaitResult> {
  const intervalMs = Math.max(3000, (opts?.intervalSec ?? 5) * 1000)
  const deadline = Date.now() + Math.max(60, opts?.expiresIn ?? 900) * 1000
  let delay = intervalMs

  while (Date.now() < deadline) {
    if (opts?.signal?.aborted) {
      return { ok: false, message: '已取消登录' }
    }
    await sleep(delay, opts?.signal)
    if (opts?.signal?.aborted) {
      return { ok: false, message: '已取消登录' }
    }

    try {
      const body = new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: XAI_OAUTH_CLIENT_ID,
        device_code: deviceCode
      })
      const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body,
        signal: opts?.signal
      })
      const text = await res.text()
      let json: Record<string, unknown> = {}
      try {
        json = JSON.parse(text) as Record<string, unknown>
      } catch {
        /* non-json */
      }

      if (res.ok && typeof json.access_token === 'string') {
        const expiresIn =
          typeof json.expires_in === 'number' ? json.expires_in : undefined
        return {
          ok: true,
          message: 'SuperGrok 订阅登录成功',
          accessToken: json.access_token,
          refreshToken:
            typeof json.refresh_token === 'string' ? json.refresh_token : undefined,
          expiresAt: expiresIn
            ? new Date(Date.now() + expiresIn * 1000).toISOString()
            : undefined
        }
      }

      const err = String(json.error ?? '')
      if (err === 'authorization_pending') {
        continue
      }
      if (err === 'slow_down') {
        delay = Math.min(delay + 2000, 15_000)
        continue
      }
      if (err === 'expired_token') {
        return { ok: false, message: '设备码已过期，请重新点「浏览器登录 SuperGrok」' }
      }
      if (err === 'access_denied') {
        return { ok: false, message: '你在浏览器里拒绝了授权' }
      }
      if (!res.ok) {
        const desc =
          typeof json.error_description === 'string'
            ? json.error_description
            : text.slice(0, 180)
        // 仍可能是 pending 类文案
        if (/pending/i.test(desc)) continue
        return {
          ok: false,
          message: `换票失败 HTTP ${res.status}${desc ? `：${desc}` : ''}`
        }
      }
    } catch (e) {
      if (opts?.signal?.aborted) {
        return { ok: false, message: '已取消登录' }
      }
      // 网络抖动：继续轮询
      console.warn('[xai-oauth] poll error', e)
    }
  }

  return { ok: false, message: '等待浏览器授权超时，请重试' }
}

/** 用 refresh_token 刷新 access_token（带超时，避免发送时一直转圈） */
export async function refreshXaiToken(
  refreshToken: string
): Promise<XaiDeviceWaitResult> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20_000)
  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: XAI_OAUTH_CLIENT_ID,
      refresh_token: refreshToken
    })
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body,
      signal: ctrl.signal
    })
    const text = await res.text()
    let json: Record<string, unknown> = {}
    try {
      json = JSON.parse(text) as Record<string, unknown>
    } catch {
      /* ignore */
    }
    if (!res.ok || typeof json.access_token !== 'string') {
      return {
        ok: false,
        message:
          typeof json.error_description === 'string'
            ? json.error_description
            : `刷新 token 失败 HTTP ${res.status}`
      }
    }
    const expiresIn =
      typeof json.expires_in === 'number' ? json.expires_in : undefined
    return {
      ok: true,
      message: 'token 已刷新',
      accessToken: json.access_token,
      refreshToken:
        typeof json.refresh_token === 'string' ? json.refresh_token : refreshToken,
      expiresAt: expiresIn
        ? new Date(Date.now() + expiresIn * 1000).toISOString()
        : undefined
    }
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      return { ok: false, message: '刷新 SuperGrok 登录超时（20s），请检查网络后重试' }
    }
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  } finally {
    clearTimeout(timer)
  }
}

/** 持久化加密后的订阅 token */
export async function persistXaiTokens(
  tokens: { accessToken: string; refreshToken?: string; expiresAt?: string },
  encrypt?: TokenEncryptFn
): Promise<void> {
  const meta: OAuthXaiConfig = {
    connected: true,
    expiresAt: tokens.expiresAt
  }
  if (encrypt) {
    meta.accessTokenEnc = encrypt(tokens.accessToken)
    if (tokens.refreshToken) meta.refreshTokenEnc = encrypt(tokens.refreshToken)
  }
  await saveOAuthXaiMeta(meta)
}

/** 兼容：仍支持从 Hermes 缓存导入 */
export async function importHermesXaiCredentials(
  encrypt?: TokenEncryptFn
): Promise<XaiDeviceWaitResult> {
  const candidates = [
    path.join(os.homedir(), '.hermes', 'auth.json'),
    path.join(os.homedir(), '.config', 'hermes', 'auth.json')
  ]
  let authPath: string | null = null
  for (const p of candidates) {
    try {
      await fs.access(p)
      authPath = p
      break
    } catch {
      /* next */
    }
  }
  if (!authPath) {
    return {
      ok: false,
      message: '未找到 Hermes 登录缓存。请用「浏览器登录 SuperGrok」走设备码流程。'
    }
  }
  try {
    const raw = await fs.readFile(authPath, 'utf8')
    const json = JSON.parse(raw) as Record<string, unknown>
    let accessToken = ''
    let refreshToken = ''
    const tryPick = (obj: unknown) => {
      if (!obj || typeof obj !== 'object') return
      const o = obj as Record<string, unknown>
      if (typeof o.access_token === 'string' && o.access_token) accessToken = o.access_token
      if (typeof o.refresh_token === 'string' && o.refresh_token)
        refreshToken = o.refresh_token
      if (typeof o.accessToken === 'string' && o.accessToken) accessToken = o.accessToken
      if (typeof o.refreshToken === 'string' && o.refreshToken)
        refreshToken = o.refreshToken
    }
    tryPick(json)
    tryPick(json.tokens)
    tryPick(json['xai-oauth'])
    if (json.providers && typeof json.providers === 'object') {
      const providers = json.providers as Record<string, unknown>
      tryPick(providers['xai-oauth'])
      tryPick(providers.xai)
    }
    if (!accessToken) {
      for (const v of Object.values(json)) {
        if (v && typeof v === 'object') {
          tryPick(v)
          if (accessToken) break
        }
      }
    }
    if (!accessToken) {
      return {
        ok: false,
        message: `已找到 ${authPath}，但未解析到 access_token`
      }
    }
    await persistXaiTokens(
      { accessToken, refreshToken: refreshToken || undefined },
      encrypt
    )
    return {
      ok: true,
      message: `已从 Hermes 导入（${authPath}）`,
      accessToken,
      refreshToken: refreshToken || undefined
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('aborted'))
      return
    }
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(new Error('aborted'))
      },
      { once: true }
    )
  })
}
