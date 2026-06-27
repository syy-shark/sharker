/**
 * OpenAI ChatGPT / Codex 凭据导入与元数据存储。
 */
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

/** OAuth 连接状态 */
export interface OAuthGptConfig {
  connected: boolean
  email?: string
  /** 加密 blob 由 main safeStorage 持有 */
  accessTokenEnc?: string
  refreshTokenEnc?: string
  expiresAt?: string
  authMode?: string
}

/** Codex auth.json 结构（精简） */
interface CodexAuthJson {
  auth_mode?: string
  OPENAI_API_KEY?: string
  tokens?: {
    access_token?: string
    refresh_token?: string
    id_token?: string
  }
  last_refresh?: string
  agent_identity?: string
}

/** 凭据导入结果 */
export interface CodexImportResult {
  ok: boolean
  message: string
  email?: string
  /** 供 main 进程创建 provider 预设（不写入 renderer） */
  accessToken?: string
  authMode?: string
}

function configPath(): string {
  return path.join(os.homedir(), '.sharker', 'oauth-gpt.json')
}

/** 读取 OAuth 元数据（不含明文 token） */
export async function loadOAuthGptMeta(): Promise<OAuthGptConfig> {
  try {
    const raw = await fs.readFile(configPath(), 'utf8')
    return JSON.parse(raw) as OAuthGptConfig
  } catch {
    return { connected: false }
  }
}

/** 保存 OAuth 元数据 */
export async function saveOAuthGptMeta(meta: OAuthGptConfig): Promise<void> {
  const dir = path.dirname(configPath())
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(configPath(), JSON.stringify(meta, null, 2), 'utf8')
}

/** 查找本机 Codex auth.json 路径 */
async function findCodexAuthPath(): Promise<string | null> {
  const codexHome = process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex')
  const candidates = [
    path.join(codexHome, 'auth.json'),
    path.join(os.homedir(), '.codex', 'auth.json'),
    path.join(os.homedir(), '.config', 'codex', 'auth.json'),
    path.join(os.homedir(), '.local', 'share', 'codex', 'auth.json')
  ]
  for (const p of candidates) {
    try {
      await fs.access(p)
      return p
    } catch {
      /* try next */
    }
  }
  return null
}

/** 从 JWT id_token 解析 email */
function emailFromIdToken(idToken?: string): string | undefined {
  if (!idToken) return undefined
  try {
    const payloadPart = idToken.split('.')[1]
    if (!payloadPart) return undefined
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/')
    const json = Buffer.from(normalized, 'base64').toString('utf8')
    const payload = JSON.parse(json) as { email?: string }
    return payload.email
  } catch {
    return undefined
  }
}

/** 读取并解析 Codex auth.json */
async function readCodexAuth(): Promise<{ auth: CodexAuthJson; path: string } | null> {
  const authPath = await findCodexAuthPath()
  if (!authPath) return null
  const raw = await fs.readFile(authPath, 'utf8')
  const auth = JSON.parse(raw) as CodexAuthJson
  return { auth, path: authPath }
}

/** 加密回调（main 进程 safeStorage） */
export type TokenEncryptFn = (plain: string) => string

/**
 * 从本机 Codex 登录缓存导入 ChatGPT 订阅凭据。
 * 优先 ~/.codex/auth.json（或 CODEX_HOME）。
 */
export async function importCodexCredentials(
  encrypt?: TokenEncryptFn
): Promise<CodexImportResult> {
  const found = await readCodexAuth()
  if (!found) {
    return {
      ok: false,
      message:
        '未找到 Codex 登录。请先在本机执行 codex login，或确认 ~/.codex/auth.json 存在。'
    }
  }

  const { auth, path: authPath } = found
  const accessToken = auth.tokens?.access_token ?? auth.OPENAI_API_KEY
  const refreshToken = auth.tokens?.refresh_token

  if (!accessToken) {
    return {
      ok: false,
      message:
        'auth.json 存在但未包含 access token（可能使用 keyring 存储）。请将 cli_auth_credentials_store 设为 file 后重新 codex login。'
    }
  }

  const email =
    emailFromIdToken(auth.tokens?.id_token) ?? auth.agent_identity ?? undefined
  const meta: OAuthGptConfig = {
    connected: true,
    email,
    expiresAt: auth.last_refresh,
    authMode: auth.auth_mode
  }

  if (encrypt) {
    meta.accessTokenEnc = encrypt(accessToken)
    if (refreshToken) meta.refreshTokenEnc = encrypt(refreshToken)
  }

  await saveOAuthGptMeta(meta)

  const label = email ? `已导入 ${email}` : '已导入 Codex 凭据'
  return {
    ok: true,
    message: `${label}（${authPath}）`,
    email,
    accessToken,
    authMode: auth.auth_mode
  }
}

/** @deprecated 保留供旧代码引用；请改用 importCodexCredentials */
export function buildOAuthGptAuthUrl(): string {
  return 'https://auth.openai.com/'
}
