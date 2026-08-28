/// <reference types="electron-vite/node" />
/**
 * Electron 主进程入口：窗口生命周期、全部 IPC 注册与 Agent 对话调度。
 * @see electron/ARCH.md
 */
import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  clipboard,
  nativeImage,
  net,
  Notification,
  powerSaveBlocker,
  shell,
  safeStorage
} from 'electron'
import fs from 'fs'
import path from 'path'
import appIconBundled from '../../resources/icon.png?asset'
import { canExportChatImage, suggestedImageFilename, type ChatImageExportInput } from '../../shared/chat-image'
import { IPC } from '../../shared/ipc'
import { DEEPLINK_SCHEME } from '../../shared/deeplink'
import { installApplicationMenu } from './app-menu'
import { loadSettings, saveSettings } from '../settings-store'
import type {
  AppSettings,
  ApprovalRequest,
  ChatAttachment,
  ChatMessage,
  StreamChunk
} from '../../shared/types'
import { generateTitle, type ApprovalHandler } from '../../agent/loop'
import {
  hydrateSubAgents,
  listSubAgentSnapshots,
  sendSubAgentMessage,
  setSubAgentListener,
  stopSubAgent
} from '../../agent/coordinator'
import { executeUserInput, abortActiveTurn, hasActiveTurn } from '../../agent/pipeline'
import { enterPlanMode, exitPlanMode, getHarnessPhase } from '../../tools/harness-state'
import {
  ConversationApprovalRegistry,
  normalizeApprovalDecision,
  type ApprovalDecision
} from '../../shared/approval-session'
import { initMemorySystem, onSettingsChanged } from '../../agent/memory/init'
import { closeMemoryDb } from '../../agent/memory/db'
import { testProvider, listProviderModels, simpleCompletion } from '../../providers/openai'
import { normalizeSettings, getActiveWorkspacePath, globalWorkspacePath } from '../../shared/workspace'
import { importCodexCredentials } from '../../shared/oauth-gpt'
import {
  importHermesXaiCredentials,
  loadOAuthXaiMeta,
  persistXaiTokens,
  refreshXaiToken,
  startXaiDeviceCode,
  waitXaiDeviceToken
} from '../../shared/oauth-xai'
import type { Conversation } from '../../shared/conversation'
import {
  createConversationOnDisk,
  deleteConversation,
  setConversationArchived,
  listArchivedConversations,
  listWorkspaceConversations,
  loadConversation,
  saveConversation,
  setActiveConversation,
  patchConversationMeta,
  clearWorkspaceConversationUnread
} from '../conversations-store'
import {
  disableBrowserUse,
  disableComputerUse,
  ensureBrowserUseReady,
  ensureComputerUseReady
} from '../../tools/services/feature-use-setup'
import { gatherComputerUseStatus } from '../../shared/computer-use-status'
import {
  gatherBrowserUseStatus,
  runBrowserUseManifestInstall
} from '../../shared/browser-use-status'
import { compressContextForce } from '../../shared/context-compress'
import { getUsageHistory } from '../../shared/token-usage-store'
import { buildWorkspaceForest, searchWorkspaceFiles } from '../../shared/workspace-tree'
import { loadSkills } from '../../skills/loader'
import { runGit } from '../../tools/shared/git-runner'
import {
  createPermanentWorktree,
  inspectWorktreePath,
  prepareThreadWorktree,
  removeManagedWorktree
} from '../../tools/thread-worktree'
import { initAgentsMdFile, readPersonalAgentsMd, writePersonalAgentsMd } from '../../agent/agents-md'
import { listMemoriesExact } from '../../agent/memory/memories'
import { getActiveSessionId, getWorkspaceProjectId } from '../../agent/memory/workspaces-sync'
import { loadMcpConfig, listMcpToolsQuick } from '../../tools/services/mcp-registry'
import { diffFromGitTexts, isDeletedGitChange } from '../../shared/git-change-diff'
import {
  applyGitReviewAction,
  type GitReviewAction,
  type GitReviewIo
} from '../../shared/git-review-actions'
import { applyGitHunkAction } from '../../shared/git-hunk-actions'
import { parseGitNumstat, parseGitStatusPorcelain } from '../../shared/git-status'
import { commitStagedChanges, pushCurrentBranch } from '../../shared/git-commit'
import { listBranchChanges, listCommitChanges, listRecentCommits } from '../../shared/git-compare'
import { createPullRequest } from '../../shared/git-pr'
import { loadPullRequestContext, parsePrUrlParts } from '../../shared/git-pr-context'
import { localCommentsForGithub, postPullRequestLineComments } from '../../shared/git-pr-review'
import { formatThreadWindowHash } from '../../shared/thread-window'
import { createNamedBranch } from '../../shared/git-branch-create'
import { handoffCheckout } from '../../shared/git-handoff'
import { mkdir, readFile, rm, stat, unlink, writeFile } from 'fs/promises'
import { spawn } from 'child_process'
import {
  activateTerminal,
  bindTerminalThread,
  createTerminal,
  killAllTerminals,
  killTerminal,
  resizeTerminal,
  writeTerminal
} from './terminal-manager'
import {
  listAutomations,
  listAutomationQueue,
  saveAutomations,
  saveAutomationQueue,
  startAutomationScheduler
} from './automation-scheduler'
import { stopLsp } from '../../tools/services/lsp-client'

let mainWindow: BrowserWindow | null = null
const threadWindows = new Map<string, BrowserWindow>()
let settings: AppSettings
/** chat:send 进行中计数：排队未入槽时也要挡住休眠 */
let preventSleepHolds = 0
let sleepBlockerId: number | null = null

/** 有回合在跑且设置打开时阻止系统休眠（对标 Codex Prevent sleep while running） */
function syncPreventSleep(): void {
  const want = Boolean(settings?.preventSleepWhileRunning) && (preventSleepHolds > 0 || hasActiveTurn())
  if (want) {
    if (sleepBlockerId == null || !powerSaveBlocker.isStarted(sleepBlockerId)) {
      sleepBlockerId = powerSaveBlocker.start('prevent-app-suspension')
    }
    return
  }
  if (sleepBlockerId == null) return
  if (powerSaveBlocker.isStarted(sleepBlockerId)) powerSaveBlocker.stop(sleepBlockerId)
  sleepBlockerId = null
}
let pendingDeeplink: string | null = null

function registerDeeplinkScheme(): void {
  if (process.defaultApp) {
    const appPath = path.resolve(process.argv[1] ?? '.')
    app.setAsDefaultProtocolClient(DEEPLINK_SCHEME, process.execPath, [appPath])
  } else {
    app.setAsDefaultProtocolClient(DEEPLINK_SCHEME)
  }
}

function broadcastDeeplink(url: string): void {
  const wins = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
  if (!wins.length) {
    pendingDeeplink = url
    return
  }
  pendingDeeplink = null
  for (const w of wins) {
    if (w.isMinimized()) w.restore()
    w.show()
    w.focus()
    w.webContents.send(IPC.DEEPLINK_OPEN, url)
  }
}

registerDeeplinkScheme()
app.on('open-url', (event, url) => {
  event.preventDefault()
  broadcastDeeplink(url)
})

function broadcastToRenderers(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

function windowFromEvent(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

const pendingApprovals = new Map<
  string,
  { resolve: (v: ApprovalDecision) => void; reject: (e: Error) => void }
>()
/** 按会话隔离的「允许本会话」授权表 */
const approvalRegistry = new ConversationApprovalRegistry()

let cachedAppIcon: Electron.NativeImage | undefined

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
const ATTACHMENT_MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'text/plain': 'txt'
}

function sanitizeAttachmentName(name: string): string {
  return (name || 'image')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'image'
}

/**
 * SuperGrok 订阅：access token 过期则用 refresh_token 刷新，并写回 settings。
 * 失败时抛错，让聊天区显示明确提示（不要静默用过期 token）。
 */
async function ensureXaiSubscriptionFresh(
  s: AppSettings,
  opts?: { force?: boolean }
): Promise<AppSettings> {
  const provider = s.providers.find((p) => p.id === 'xai-grok')
  if (!provider || provider.authMode !== 'subscription') return s
  // 默认仅在当前 active 为 xAI 时刷新；测试/拉模型可 force
  if (!opts?.force && s.activeProviderId !== 'xai-grok') return s

  let meta
  try {
    meta = await loadOAuthXaiMeta()
  } catch (e) {
    console.warn('[xai-oauth] load meta failed', e)
    return s
  }

  // 未走 OAuth 元数据、但 settings 里仍有 key：直接放行
  if (!meta.connected && provider.apiKey?.trim()) return s

  const expiresMs = meta.expiresAt ? Date.parse(meta.expiresAt) : NaN
  const skewMs = 90_000
  const hasExpiry = Number.isFinite(expiresMs)
  const stillValid =
    hasExpiry && Date.now() < expiresMs - skewMs && Boolean(provider.apiKey?.trim())
  if (stillValid) return s

  // 无过期时间但有 key：尝试直接用（兼容旧数据）
  if (!hasExpiry && provider.apiKey?.trim() && !meta.refreshTokenEnc) return s

  const reLoginHint =
    '请打开 **设置 → 模型 → xAI Grok**，重新登录 SuperGrok（设备码授权）。'

  if (!meta.refreshTokenEnc || !safeStorage.isEncryptionAvailable()) {
    throw new Error(`SuperGrok 登录已过期或未登录。${reLoginHint}`)
  }

  try {
    const refreshToken = safeStorage.decryptString(Buffer.from(meta.refreshTokenEnc, 'base64'))
    const refreshed = await refreshXaiToken(refreshToken)
    if (!refreshed.ok || !refreshed.accessToken) {
      console.warn('[xai-oauth] refresh failed:', refreshed.message)
      throw new Error(
        `SuperGrok 登录已过期，自动刷新失败（${refreshed.message || '未知错误'}）。${reLoginHint}`
      )
    }
    const encrypt = (plain: string) => safeStorage.encryptString(plain).toString('base64')
    await persistXaiTokens(
      {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresAt: refreshed.expiresAt
      },
      encrypt
    )
    const next = normalizeSettings(
      {
        ...s,
        providers: s.providers.map((p) =>
          p.id === 'xai-grok'
            ? {
                ...p,
                apiKey: refreshed.accessToken!,
                authMode: 'subscription' as const,
                subscriptionLabel: p.subscriptionLabel || '已登录 SuperGrok 订阅'
              }
            : p
        )
      },
      app.getPath('home')
    )
    await saveSettings(next)
    settings = next
    console.log('[xai-oauth] access token refreshed, expiresAt=', refreshed.expiresAt)
    return next
  } catch (e) {
    if (e instanceof Error && e.message.includes('SuperGrok')) throw e
    console.warn('[xai-oauth] refresh error', e)
    throw new Error(
      `SuperGrok 登录刷新失败（${e instanceof Error ? e.message : String(e)}）。${reLoginHint}`
    )
  }
}

function parseDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } {
  const m = dataUrl.match(/^data:([^;,]+)(?:;charset=[^;,]+)?;base64,(.+)$/)
  if (!m) throw new Error('附件数据格式无效')
  const mimeType = m[1].toLowerCase()
  if (!ATTACHMENT_MIME_TO_EXT[mimeType]) throw new Error(`不支持的附件类型: ${mimeType}`)
  const buffer = Buffer.from(m[2], 'base64')
  if (buffer.length > MAX_ATTACHMENT_BYTES) {
    throw new Error(`附件过大（>${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)}MB）`)
  }
  return { mimeType, buffer }
}

async function saveChatAttachment(input: {
  name: string
  mimeType: string
  dataUrl: string
}): Promise<ChatAttachment> {
  const parsed = parseDataUrl(input.dataUrl)
  if (input.mimeType && input.mimeType.toLowerCase() !== parsed.mimeType) {
    throw new Error('附件 MIME 类型不一致')
  }
  const id = crypto.randomUUID()
  const ext = ATTACHMENT_MIME_TO_EXT[parsed.mimeType]
  const safeName = sanitizeAttachmentName(input.name)
  const dir = path.join(app.getPath('userData'), 'attachments')
  await fs.promises.mkdir(dir, { recursive: true })
  const filePath = path.join(dir, `${Date.now()}-${id}-${safeName}.${ext}`)
  await fs.promises.writeFile(filePath, parsed.buffer)
  const kind = parsed.mimeType.startsWith('image/') ? 'image' : 'text'
  return {
    id,
    name: safeName,
    mimeType: parsed.mimeType,
    path: filePath,
    size: parsed.buffer.length,
    kind,
    text: kind === 'text' ? parsed.buffer.toString('utf8') : undefined
  }
}

function resolveAttachmentPath(filePath: string): string {
  const attachmentsDir = path.join(app.getPath('userData'), 'attachments')
  const resolved = path.resolve(filePath)
  if (!resolved.startsWith(path.resolve(attachmentsDir) + path.sep)) {
    throw new Error('附件路径无效')
  }
  return resolved
}

async function readChatImageBytes(
  input: ChatImageExportInput
): Promise<{ buffer: Buffer; ext: string }> {
  if (!canExportChatImage(input)) throw new Error('不支持的图片来源')
  if (input.filePath?.trim()) {
    const resolved = resolveAttachmentPath(input.filePath)
    const buffer = await fs.promises.readFile(resolved)
    return { buffer, ext: path.extname(resolved).toLowerCase() || '.png' }
  }
  const src = String(input.src || '').trim()
  if (src.startsWith('data:image/')) {
    const match = /^data:image\/([a-zA-Z0-9.+-]+);base64,([\s\S]+)$/i.exec(src)
    if (!match) throw new Error('无法读取图片')
    const subtype = match[1]!.toLowerCase()
    const ext = subtype === 'jpeg' ? '.jpg' : `.${subtype}`
    return { buffer: Buffer.from(match[2]!, 'base64'), ext }
  }
  if (/^https?:\/\//i.test(src)) {
    const res = await net.fetch(src)
    if (!res.ok) throw new Error('无法下载图片')
    const buffer = Buffer.from(await res.arrayBuffer())
    const img = nativeImage.createFromBuffer(buffer)
    if (img.isEmpty()) throw new Error('无法读取图片')
    const extMatch = /\.(jpe?g|gif|webp|png|bmp|avif)(?:\?|#|$)/i.exec(src)
    return { buffer, ext: extMatch ? extMatch[0].toLowerCase().replace('.jpeg', '.jpg') : '.png' }
  }
  throw new Error('不支持的图片来源')
}

async function readAttachmentDataUrl(filePath: string): Promise<string> {
  const resolved = resolveAttachmentPath(filePath)
  const ext = path.extname(resolved).toLowerCase()
  const mimeType =
    ext === '.txt'
      ? 'text/plain'
      : ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : ext === '.webp'
          ? 'image/webp'
          : ext === '.gif'
            ? 'image/gif'
            : 'image/png'
  const buf = await fs.promises.readFile(resolved)
  return `data:${mimeType};base64,${buf.toString('base64')}`
}

/** 从磁盘路径加载 NativeImage */
function loadIconFromPath(filePath: string): Electron.NativeImage | undefined {
  if (!filePath || !fs.existsSync(filePath)) return undefined
  try {
    const img = nativeImage.createFromPath(filePath)
    if (img.isEmpty()) return undefined
    return img
  } catch {
    return undefined
  }
}

/** 从打包资源与项目路径中解析应用图标。 */
function resolveAppIcon(): Electron.NativeImage | undefined {
  if (cachedAppIcon) return cachedAppIcon

  const fileCandidates: string[] = [
    appIconBundled,
    path.join(__dirname, 'icon.png')
  ]

  const relPaths = [
    'resources/icon.png',
    'resources/icons/256x256.png',
    'src/assets/logo-shark.png',
    'public/logo-shark.png'
  ]
  const roots = new Set<string>([
    process.cwd(),
    path.resolve(__dirname, '../..'),
    path.resolve(__dirname, '../../..'),
    app.getAppPath()
  ])
  if (app.isPackaged) {
    roots.add(process.resourcesPath)
    roots.add(path.join(process.resourcesPath, 'app'))
  }

  for (const root of roots) {
    for (const rel of relPaths) {
      fileCandidates.push(path.join(root, rel))
    }
  }

  for (const p of fileCandidates) {
    const img = loadIconFromPath(p)
    if (img) {
      cachedAppIcon = img
      return img
    }
  }
  return undefined
}

/** 将图标应用到 Dock */
function applyAppIcon(icon: Electron.NativeImage): void {
  if (app.dock) {
    app.dock.setIcon(icon)
  }
}

/** 按设置应用 macOS 窗口材质：浅色大面积玻璃 vibrancy / 深色金属实色 */
function applyWindowAppearance(win: BrowserWindow, s: AppSettings): void {
  const dark = s.uiTheme === 'dark'
  if (!dark) {
    // 浅色：透明窗 + under-window 磨砂（刚才可用组合）
    win.setBackgroundColor('#e8eaed')
    const effects: Array<'under-window' | 'fullscreen-ui' | 'sidebar' | 'header' | 'hud'> = [
      'under-window',
      'fullscreen-ui',
      'sidebar',
      'header',
      'hud'
    ]
    let applied: string | null = null
    for (const effect of effects) {
      try {
        win.setVibrancy(effect)
        applied = effect
        break
      } catch {
        /* try next */
      }
    }
    if (!applied) console.warn('[window] failed to apply vibrancy')
    else console.log('[window] vibrancy =', applied)
  } else {
    try {
      win.setVibrancy(null)
    } catch {
      /* ignore */
    }
    win.setBackgroundColor('#0b0d11')
  }
  if (!win.isVisible()) {
    win.show()
  }
  win.focus()
}

/** 禁止 pinch / 菜单缩放，字号改走渲染进程 --ui-font-scale（对标 Codex ⌘+/-） */
function lockWindowZoom(win: BrowserWindow): void {
  try {
    win.webContents.setVisualZoomLevelLimits(1, 1)
    win.webContents.setZoomFactor(1)
  } catch {
    /* 旧版 Electron 可能没有 setVisualZoomLevelLimits */
  }
}

/** 创建主窗口并加载渲染进程（开发 URL 或打包 HTML）。 */
function createWindow(): void {
  const icon = resolveAppIcon()
  const dark = settings?.uiTheme === 'dark'
  const useGlass = !dark

  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    title: 'Sharker',
    show: false,
    backgroundColor: useGlass ? '#e8eaed' : '#0b0d11',
    /* 仅浅色玻璃需要透明；深色金属用实色底，避免窗口“看不见” */
    transparent: false, // 避免无 vibrancy 时整窗纯黑；材质用 CSS 玻璃层表达
    vibrancy: useGlass ? 'under-window' : undefined,
    visualEffectState: 'active',
    frame: true,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[window] did-fail-load', code, desc, url)
  })
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[window] did-finish-load', mainWindow?.webContents.getURL())
  })
  mainWindow.webContents.on('console-message', (event) => {
    // Electron 新事件对象；兼容旧签名字段
    const level = (event as any).level ?? 0
    const message = String((event as any).message ?? '')
    const line = (event as any).lineNumber ?? (event as any).line ?? 0
    const sourceId = String((event as any).sourceId ?? '')
    if (level >= 2) console.warn('[renderer]', message, `${sourceId}:${line}`)
  })

  mainWindow.setMenuBarVisibility(false)
  lockWindowZoom(mainWindow)
  applyWindowAppearance(mainWindow, settings)

  if (icon) {
    mainWindow.setIcon(icon)
  }

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.show()
    mainWindow.focus()
    if (process.platform === 'darwin') app.dock?.show()
    if (pendingDeeplink) broadcastDeeplink(pendingDeeplink)
  })

  /** 禁止聊天内链接在应用窗口内跳转（否则会顶掉 UI、窗口变透明） */
  const rendererOrigin = process.env.ELECTRON_RENDERER_URL
    ? new URL(process.env.ELECTRON_RENDERER_URL).origin
    : null

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (rendererOrigin && url.startsWith(rendererOrigin)) return
    if (url.startsWith('file://')) return
    event.preventDefault()
    if (isSafeExternalUrl(url)) void shell.openExternal(url)
  })
}

/** 弹出独立线程窗：同一渲染入口，hash 指定对话，直播 chunk 广播到所有窗 */
function createThreadWindow(workspaceId: string, conversationId: string, title: string): void {
  const icon = resolveAppIcon()
  const dark = settings?.uiTheme === 'dark'
  const useGlass = !dark
  const hash = formatThreadWindowHash(workspaceId, conversationId)
  const win = new BrowserWindow({
    width: 720,
    height: 780,
    minWidth: 420,
    minHeight: 480,
    title: title || '对话',
    show: false,
    backgroundColor: useGlass ? '#e8eaed' : '#0b0d11',
    transparent: false,
    vibrancy: useGlass ? 'under-window' : undefined,
    visualEffectState: 'active',
    frame: true,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true
    }
  })
  threadWindows.set(conversationId, win)
  win.on('closed', () => {
    if (threadWindows.get(conversationId) === win) threadWindows.delete(conversationId)
  })
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    const base = devUrl.endsWith('/') ? devUrl.slice(0, -1) : devUrl
    void win.loadURL(`${base}/${hash}`)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'), {
      hash: hash.replace(/^#/, '')
    })
  }
  win.setMenuBarVisibility(false)
  lockWindowZoom(win)
  applyWindowAppearance(win, settings)
  if (settings?.popoutAlwaysOnTop) win.setAlwaysOnTop(true, 'floating')
  if (icon) win.setIcon(icon)
  win.once('ready-to-show', () => {
    if (win.isDestroyed()) return
    win.show()
    win.focus()
  })
  const rendererOrigin = process.env.ELECTRON_RENDERER_URL
    ? new URL(process.env.ELECTRON_RENDERER_URL).origin
    : null
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (rendererOrigin && url.startsWith(rendererOrigin)) return
    if (url.startsWith('file://')) return
    event.preventDefault()
    if (isSafeExternalUrl(url)) void shell.openExternal(url)
  })
}

/** 仅允许 http(s) 外链，防止 file/javascript 等协议 */
function isSafeExternalUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/** 高危工具调用审批：向渲染进程推送请求并等待用户响应（once/session/deny）。 */
const approvalHandler: ApprovalHandler = (req) => {
  return new Promise((resolve, reject) => {
    pendingApprovals.set(req.id, { resolve, reject })
    broadcastToRenderers('chat:approval', req)
  })
}

/** 注册全部 IPC handler（设置、对话、窗口、聊天等）。 */
function registerIpc(): void {
  setSubAgentListener((snapshot) => {
    broadcastToRenderers('agents:update', snapshot)
  })
  ipcMain.handle(IPC.GET_SETTINGS, async () => settings)

  ipcMain.handle(IPC.SAVE_SETTINGS, async (_e, next: AppSettings) => {
    const prev = settings
    // 渲染侧漏传 apiKey 时沿用主进程内存中的 key，避免切换模型后 Key 被清空
    const mergedProviders = (next.providers ?? []).map((p) => {
      const prevP = prev.providers.find((x) => x.id === p.id)
      if (!p.apiKey?.trim() && prevP?.apiKey?.trim()) {
        return { ...p, apiKey: prevP.apiKey }
      }
      return p
    })
    settings = normalizeSettings({ ...next, providers: mergedProviders }, app.getPath('home'))
    await saveSettings(settings)
    if (
      mainWindow &&
      !mainWindow.isDestroyed() &&
      (prev.uiGlass !== settings.uiGlass || prev.uiTheme !== settings.uiTheme)
    ) {
      applyWindowAppearance(mainWindow, settings)
    }
    void onSettingsChanged(settings).catch((e) => console.warn('[memory] workspace sync', e))
    const workspace = getActiveWorkspacePath(settings) ?? ''
    try {
      if (settings.computerUseEnabled && !prev.computerUseEnabled) {
        await ensureComputerUseReady(workspace)
      } else if (!settings.computerUseEnabled && prev.computerUseEnabled) {
        await disableComputerUse(workspace)
      }
      if (settings.browserUseEnabled && !prev.browserUseEnabled) {
        await ensureBrowserUseReady(workspace, app.getAppPath())
      } else if (!settings.browserUseEnabled && prev.browserUseEnabled) {
        await disableBrowserUse(workspace)
      }
    } catch (e) {
      console.warn('[feature-use] setup failed', e)
    }
    syncPreventSleep()
    return true
  })

  /** draft 来自渲染进程时 apiKey 常被清空；合并主进程内存里的 Key */
  const snapshotWithKeys = (draft?: AppSettings): AppSettings => {
    if (!draft) return settings
    const mergedProviders = (draft.providers ?? []).map((p) => {
      const live = settings.providers.find((x) => x.id === p.id)
      if (!p.apiKey?.trim() && live?.apiKey?.trim()) {
        return { ...p, apiKey: live.apiKey }
      }
      return p
    })
    return normalizeSettings({ ...draft, providers: mergedProviders }, app.getPath('home'))
  }

  ipcMain.handle(
    IPC.TEST_PROVIDER,
    async (_e, providerId: string, draft?: AppSettings) => {
      let snapshot = snapshotWithKeys(draft)
      if (providerId === 'xai-grok') {
        try {
          snapshot = await ensureXaiSubscriptionFresh(snapshot, { force: true })
        } catch (e) {
          return {
            ok: false,
            message: e instanceof Error ? e.message : String(e)
          }
        }
      }
      return testProvider(snapshot, providerId)
    }
  )

  ipcMain.handle(
    IPC.LIST_PROVIDER_MODELS,
    async (_e, providerId: string, draft?: AppSettings) => {
      let snapshot = snapshotWithKeys(draft)
      if (providerId === 'xai-grok') {
        try {
          snapshot = await ensureXaiSubscriptionFresh(snapshot, { force: true })
        } catch (e) {
          return {
            ok: false,
            models: [],
            message: e instanceof Error ? e.message : String(e)
          }
        }
      }
      const provider = snapshot.providers.find((p) => p.id === providerId)
      if (!provider) return { ok: false, models: [], message: '未找到该 API 配置' }
      return listProviderModels(provider)
    }
  )

  /** ChatGPT 订阅：从本机 Codex 登录缓存导入 access token */
  ipcMain.handle(IPC.IMPORT_CHATGPT_SUBSCRIPTION, async () => {
    const encrypt = safeStorage.isEncryptionAvailable()
      ? (plain: string) => safeStorage.encryptString(plain).toString('base64')
      : undefined
    const result = await importCodexCredentials(encrypt)
    if (!result.ok || !result.accessToken) {
      return { ok: false, message: result.message, settings: null as AppSettings | null }
    }
    const next = normalizeSettings(
      {
        ...settings,
        providers: settings.providers.map((p) =>
          p.id === 'openai-chatgpt'
            ? {
                ...p,
                authMode: 'subscription' as const,
                apiKey: result.accessToken!,
                subscriptionLabel: result.email
                  ? `已登录 ${result.email}`
                  : '已导入 ChatGPT 订阅'
              }
            : p
        ),
        activeProviderId: settings.activeProviderId || 'openai-chatgpt'
      },
      app.getPath('home')
    )
    settings = next
    await saveSettings(next)
    return { ok: true, message: result.message, settings: next }
  })

  /**
   * SuperGrok 订阅登录：
   * - mode=device（默认）：OAuth 设备码 → 打开 accounts.x.ai/oauth2/device?user_code=… → 轮询换票
   * - mode=hermes：从本机 Hermes 缓存导入
   */
  ipcMain.handle(
    IPC.IMPORT_XAI_SUBSCRIPTION,
    async (_e, mode: 'device' | 'hermes' = 'device') => {
      const encrypt = safeStorage.isEncryptionAvailable()
        ? (plain: string) => safeStorage.encryptString(plain).toString('base64')
        : undefined

      const applyToken = async (
        accessToken: string,
        label: string,
        message: string
      ) => {
        const next = normalizeSettings(
          {
            ...settings,
            providers: settings.providers.map((p) =>
              p.id === 'xai-grok'
                ? {
                    ...p,
                    authMode: 'subscription' as const,
                    apiKey: accessToken,
                    subscriptionLabel: label
                  }
                : p
            ),
            activeProviderId: settings.activeProviderId || 'xai-grok'
          },
          app.getPath('home')
        )
        settings = next
        await saveSettings(next)
        return {
          ok: true as const,
          message,
          settings: next,
          userCode: undefined as string | undefined,
          verificationUri: undefined as string | undefined
        }
      }

      if (mode === 'hermes') {
        const result = await importHermesXaiCredentials(encrypt)
        if (!result.ok || !result.accessToken) {
          return {
            ok: false,
            message: result.message,
            settings: null as AppSettings | null
          }
        }
        return applyToken(result.accessToken, '已导入 SuperGrok 订阅', result.message)
      }

      // —— 设备码流程（用户期望的弹窗形态）——
      const started = await startXaiDeviceCode()
      if (!started.ok || !started.deviceCode || !started.verificationUri) {
        return {
          ok: false,
          message: started.message,
          settings: null as AppSettings | null
        }
      }

      // 先把 user_code 推给渲染进程展示
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC.XAI_DEVICE_CODE, {
          userCode: started.userCode,
          verificationUri: started.verificationUri
        })
      }

      // 打开 https://accounts.x.ai/oauth2/device?user_code=XXXX
      try {
        await shell.openExternal(started.verificationUri)
      } catch (e) {
        console.warn('[xai-oauth] open browser failed', e)
      }

      const tokens = await waitXaiDeviceToken(started.deviceCode, {
        intervalSec: started.intervalSec,
        expiresIn: started.expiresIn
      })
      if (!tokens.ok || !tokens.accessToken) {
        return {
          ok: false,
          message: tokens.message,
          settings: null as AppSettings | null,
          userCode: started.userCode,
          verificationUri: started.verificationUri
        }
      }

      await persistXaiTokens(
        {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt
        },
        encrypt
      )

      return applyToken(
        tokens.accessToken,
        '已登录 SuperGrok 订阅',
        tokens.message
      )
    }
  )

  ipcMain.handle(IPC.SELECT_WORKSPACE, async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC.PICK_WORKSPACE_FOLDER, async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })

  const workspacePathById = (workspaceId: string): string =>
    settings.workspaces.find((w) => w.id === workspaceId)?.path ?? ''

  ipcMain.handle(
    IPC.LIST_CONVERSATIONS,
    async (_e, workspaceId: string) => {
      const p = workspacePathById(workspaceId)
      return listWorkspaceConversations(p, workspaceId)
    }
  )

  ipcMain.handle(
    IPC.LOAD_CONVERSATION,
    async (_e, workspaceId: string, conversationId: string) => {
      const p = workspacePathById(workspaceId)
      return loadConversation(p, workspaceId, conversationId)
    }
  )

  ipcMain.handle(
    IPC.SAVE_CONVERSATION,
    async (_e, workspaceId: string, conversation: Conversation) => {
      const p = workspacePathById(workspaceId)
      return saveConversation(p, conversation)
    }
  )

  ipcMain.handle(
    IPC.DELETE_CONVERSATION,
    async (_e, workspaceId: string, conversationId: string) => {
      const p = workspacePathById(workspaceId)
      await deleteConversation(p, workspaceId, conversationId)
      return true
    }
  )

  ipcMain.handle(
    IPC.ARCHIVE_CONVERSATION,
    async (_e, workspaceId: string, conversationId: string, archived: boolean) => {
      const p = workspacePathById(workspaceId)
      await setConversationArchived(p, workspaceId, conversationId, archived)
      return true
    }
  )

  ipcMain.handle(IPC.LIST_ARCHIVED_CONVERSATIONS, async () => {
    return listArchivedConversations()
  })

  ipcMain.handle(
    IPC.SET_ACTIVE_CONVERSATION,
    async (_e, workspaceId: string, conversationId: string | null) => {
      const p = workspacePathById(workspaceId)
      await setActiveConversation(p, workspaceId, conversationId)
      return true
    }
  )

  ipcMain.handle(
    IPC.CREATE_CONVERSATION,
    async (_e, workspaceId: string, options?: { activate?: boolean }) => {
      const p = workspacePathById(workspaceId)
      return createConversationOnDisk(p, workspaceId, options)
    }
  )

  ipcMain.handle(
    IPC.PATCH_CONVERSATION_META,
    async (
      _e,
      workspaceId: string,
      conversationId: string,
      patch: import('../../shared/conversation').ConversationMetaPatch
    ) => {
      const p = workspacePathById(workspaceId)
      return patchConversationMeta(p, workspaceId, conversationId, patch)
    }
  )

  ipcMain.handle(
    IPC.CLEAR_CONVERSATION_UNREAD,
    async (_e, workspaceId: string) => {
      const p = workspacePathById(workspaceId)
      return clearWorkspaceConversationUnread(p, workspaceId)
    }
  )

  ipcMain.handle(
    IPC.GENERATE_TITLE,
    async (_e, messages: ChatMessage[]) => {
      try {
        return await generateTitle(settings, messages)
      } catch {
        return ''
      }
    }
  )

  ipcMain.handle(
    IPC.APPROVAL_RESPONSE,
    async (_e, id: string, decision: ApprovalDecision | boolean) => {
      const pending = pendingApprovals.get(id)
      if (pending) {
        pendingApprovals.delete(id)
        pending.resolve(normalizeApprovalDecision(decision))
      }
    }
  )

  ipcMain.handle(IPC.APPROVE_DENIED_RETRY, async (_e, conversationId?: string) => {
    return approvalRegistry.approveLastDenial(conversationId)
  })

  ipcMain.handle(IPC.ABORT_CHAT, async (_e, conversationId?: string) => {
    abortActiveTurn(conversationId)
  })

  ipcMain.handle(
    IPC.SAVE_ATTACHMENT,
    async (_e, input: { name: string; mimeType: string; dataUrl: string }) =>
      saveChatAttachment(input)
  )

  ipcMain.handle(IPC.READ_ATTACHMENT_DATA_URL, async (_e, filePath: string) =>
    readAttachmentDataUrl(filePath)
  )

  ipcMain.handle(IPC.COPY_CHAT_IMAGE, async (_e, input: ChatImageExportInput) => {
    try {
      const { buffer } = await readChatImageBytes(input)
      const img = nativeImage.createFromBuffer(buffer)
      if (img.isEmpty()) return { ok: false, message: '无法读取图片' }
      clipboard.writeImage(img)
      return { ok: true }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : '复制失败' }
    }
  })

  ipcMain.handle(IPC.SAVE_CHAT_IMAGE, async (e, input: ChatImageExportInput) => {
    try {
      const { buffer, ext } = await readChatImageBytes(input)
      const win = windowFromEvent(e)
      const saveOpts = {
        defaultPath: suggestedImageFilename({ ...input, name: input.name || `image${ext}` }),
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
      }
      const result = win
        ? await dialog.showSaveDialog(win, saveOpts)
        : await dialog.showSaveDialog(saveOpts)
      if (result.canceled || !result.filePath) return { ok: false, canceled: true, message: '' }
      await fs.promises.writeFile(result.filePath, buffer)
      return { ok: true, path: result.filePath }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : '保存失败' }
    }
  })

  ipcMain.handle(
    IPC.NOTIFY_TURN_COMPLETE,
    (_e, payload: { title?: string; body?: string; conversationId?: string; workspaceId?: string }) => {
      if (!Notification.isSupported()) return false
      const n = new Notification({
        title: String(payload?.title || 'Sharker'),
        body: String(payload?.body || '回合已完成')
      })
      n.on('click', () => {
        const wins = BrowserWindow.getAllWindows()
        const win = wins[0]
        if (win) {
          if (win.isMinimized()) win.restore()
          win.show()
          win.focus()
        }
        for (const w of wins) {
          w.webContents.send(IPC.NOTIFY_TURN_CLICK, payload)
        }
      })
      n.show()
      return true
    }
  )

  ipcMain.handle(IPC.REQUEST_NOTIFY_PERMISSION, () => {
    if (!Notification.isSupported()) return { ok: false as const, permission: 'unsupported' }
    const n = new Notification({
      title: 'Sharker',
      body: '已请求系统通知权限。回合完成和批准会在这里提醒。'
    })
    n.show()
    return { ok: true as const, permission: 'prompted' }
  })

  ipcMain.handle(IPC.SET_DOCK_BADGE, (_e, count: number) => {
    const n = Math.max(0, Math.floor(Number(count) || 0))
    app.dock?.setBadge(n > 0 ? String(n) : '')
  })

  ipcMain.handle(IPC.DEEPLINK_TAKE, () => {
    const url = pendingDeeplink
    pendingDeeplink = null
    return url
  })

  ipcMain.handle(IPC.PATH_IS_DIRECTORY, (_e, target: string) => {
    try {
      return fs.statSync(String(target || '')).isDirectory()
    } catch {
      return false
    }
  })

  ipcMain.handle(IPC.WINDOW_MINIMIZE, (e) => windowFromEvent(e)?.minimize())
  ipcMain.handle(IPC.WINDOW_MAXIMIZE, (e) => {
    const win = windowFromEvent(e)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.handle(IPC.WINDOW_CLOSE, (e) => windowFromEvent(e)?.close())
  ipcMain.handle(IPC.SET_WINDOW_ALWAYS_ON_TOP, (e, flag: boolean) => {
    const win = windowFromEvent(e)
    if (!win) return false
    const on = Boolean(flag)
    if (on) win.setAlwaysOnTop(true, 'floating')
    else win.setAlwaysOnTop(false)
    return win.isAlwaysOnTop()
  })
  ipcMain.handle(IPC.GET_WINDOW_ALWAYS_ON_TOP, (e) => Boolean(windowFromEvent(e)?.isAlwaysOnTop()))
  ipcMain.handle(
    IPC.OPEN_THREAD_WINDOW,
    async (_e, workspaceId: string, conversationId: string, title?: string) => {
      const ws = String(workspaceId || '').trim()
      const id = String(conversationId || '').trim()
      if (!ws || !id) return { ok: false as const, error: '缺少对话' }
      const existing = threadWindows.get(id)
      if (existing && !existing.isDestroyed()) {
        existing.focus()
        return { ok: true as const }
      }
      createThreadWindow(ws, id, String(title || '对话'))
      return { ok: true as const }
    }
  )

  ipcMain.handle(IPC.OPEN_EXTERNAL, async (_e, url: string) => {
    if (!isSafeExternalUrl(url)) return false
    await shell.openExternal(url)
    return true
  })

  ipcMain.handle(IPC.OPEN_PATH, async (_e, targetPath: string) => {
    if (!targetPath || typeof targetPath !== 'string') return false
    const err = await shell.openPath(path.resolve(targetPath))
    return err === ''
  })

  ipcMain.handle(IPC.GET_COMPUTER_USE_STATUS, async (_e, workspace: string) => {
    return gatherComputerUseStatus(workspace)
  })

  ipcMain.handle(IPC.GET_BROWSER_USE_STATUS, async (_e, workspace: string) => {
    return gatherBrowserUseStatus(workspace)
  })

  ipcMain.handle(IPC.INSTALL_BROWSER_USE_MANIFEST, async () => {
    return runBrowserUseManifestInstall()
  })

  ipcMain.handle(IPC.COMPRESS_CONTEXT, async (_e, history: ChatMessage[]) => {
    const summarize = async (s: AppSettings, transcript: string) =>
      simpleCompletion(s, '你是对话摘要助手，用简洁中文保留关键信息。', transcript)
    const result = await compressContextForce(settings, history, summarize)
    return result
  })

  ipcMain.handle(IPC.GET_TOKEN_USAGE, async (_e, days = 365) => {
    return getUsageHistory(days)
  })

  ipcMain.handle(
    IPC.WORKSPACE_TREE,
    async (_e, workspace: string, directoriesOnly = false, extraRoots: string[] = []) => {
      const extras = Array.isArray(extraRoots)
        ? extraRoots.map((item) => path.resolve(String(item || ''))).filter(Boolean)
        : []
      return buildWorkspaceForest(String(workspace || ''), extras, { directoriesOnly })
    }
  )

  ipcMain.handle(
    IPC.WORKSPACE_SEARCH_FILES,
    async (_e, workspace: string, query = '', extraRoots: string[] = []) => {
      const root = path.resolve(String(workspace || ''))
      const extras = Array.isArray(extraRoots)
        ? extraRoots.map((item) => path.resolve(String(item || ''))).filter(Boolean)
        : []
      if (!root && extras.length === 0) return []
      return searchWorkspaceFiles(root, String(query || ''), 30, extras)
    }
  )

  ipcMain.handle(IPC.SKILLS_LIST, async (_e, workspace = '') => {
    const skills = await loadSkills(String(workspace || ''))
    return skills.map((s) => ({ name: s.name, description: s.description }))
  })

  ipcMain.handle(IPC.READ_TEXT_FILE, async (_e, filePath: string) => {
    const MAX_BYTES = 512 * 1024
    try {
      const stat = await fs.promises.stat(filePath)
      if (!stat.isFile()) return { ok: false as const, error: '不是文件' }
      if (stat.size > MAX_BYTES) {
        return { ok: false as const, error: `文件过大（>${Math.round(MAX_BYTES / 1024)}KB）` }
      }
      const content = await fs.promises.readFile(filePath, 'utf8')
      return { ok: true as const, path: filePath, content }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false as const, error: msg }
    }
  })

  ipcMain.handle(IPC.READ_FILE_DATA_URL, async (_e, filePath: string) => {
    const MAX_BYTES = 2 * 1024 * 1024
    try {
      const stat = await fs.promises.stat(filePath)
      if (!stat.isFile()) return { ok: false as const, error: '不是文件' }
      if (stat.size > MAX_BYTES) {
        return { ok: false as const, error: `文件过大（>${Math.round(MAX_BYTES / 1024)}KB）` }
      }
      const buf = await fs.promises.readFile(filePath)
      const ext = path.extname(filePath).toLowerCase().replace('.', '')
      const mime =
        ext === 'png'
          ? 'image/png'
          : ext === 'jpg' || ext === 'jpeg'
            ? 'image/jpeg'
            : ext === 'gif'
              ? 'image/gif'
              : ext === 'webp'
                ? 'image/webp'
                : ext === 'svg'
                  ? 'image/svg+xml'
                  : 'application/octet-stream'
      return {
        ok: true as const,
        path: filePath,
        dataUrl: `data:${mime};base64,${buf.toString('base64')}`
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false as const, error: msg }
    }
  })

  ipcMain.handle(IPC.GIT_BRANCH_INFO, async (_e, cwd: string) => {
    try {
      const branch = (await runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
      const porcelain = await runGit(cwd, ['status', '--porcelain'], { trim: false })
      let remoteUrl = ''
      try {
        remoteUrl = (await runGit(cwd, ['remote', 'get-url', 'origin'])).trim()
      } catch {
        remoteUrl = ''
      }
      return { isRepo: true, branch, dirty: porcelain.trim().length > 0, remoteUrl }
    } catch {
      return { isRepo: false, branch: '', dirty: false }
    }
  })

  ipcMain.handle(IPC.GIT_LIST_BRANCHES, async (_e, cwd: string) => {
    try {
      const out = await runGit(cwd, ['branch', '--format=%(refname:short)'])
      const branches = out
        .split('\n')
        .map((b) => b.trim())
        .filter(Boolean)
      return { isRepo: true, branches }
    } catch {
      return { isRepo: false, branches: [] }
    }
  })

  ipcMain.handle(IPC.GIT_CHECKOUT, async (_e, cwd: string, branch: string) => {
    return runGit(cwd, ['checkout', branch])
  })

  ipcMain.handle(
    IPC.TERMINAL_CREATE,
    async (event, cwd: string, conversationId?: string, title?: string) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) throw new Error('no window')
      return createTerminal(win, cwd, conversationId, title)
    }
  )

  ipcMain.handle(IPC.TERMINAL_WRITE, (_e, id: string, data: string) => {
    writeTerminal(id, data)
  })

  ipcMain.handle(IPC.TERMINAL_RESIZE, (_e, id: string, cols: number, rows: number) => {
    resizeTerminal(id, cols, rows)
  })

  ipcMain.handle(IPC.TERMINAL_BIND, (_e, id: string, conversationId: string) => {
    bindTerminalThread(id, conversationId)
  })

  ipcMain.handle(IPC.TERMINAL_ACTIVATE, (_e, id: string) => {
    activateTerminal(id)
  })

  ipcMain.handle(IPC.TERMINAL_KILL, (_e, id: string) => {
    killTerminal(id)
  })

  ipcMain.handle(IPC.TERMINAL_KILL_ALL, () => {
    killAllTerminals()
    return true
  })

  ipcMain.handle(IPC.LIST_AUTOMATIONS, async () => listAutomations())
  ipcMain.handle(IPC.SAVE_AUTOMATIONS, async (_e, jobs) => {
    await saveAutomations(jobs)
    return true
  })
  ipcMain.handle(IPC.LIST_AUTOMATION_QUEUE, async () => listAutomationQueue())
  ipcMain.handle(IPC.SAVE_AUTOMATION_QUEUE, async (_e, queue) => {
    await saveAutomationQueue(Array.isArray(queue) ? queue : [])
    return true
  })

  ipcMain.handle(IPC.AGENTS_LIST, async (_e, parentConversationId?: string) => {
    return listSubAgentSnapshots(String(parentConversationId || ''))
  })
  ipcMain.handle(IPC.AGENTS_STOP, async (_e, id: string) => stopSubAgent(String(id || '')))
  ipcMain.handle(IPC.AGENTS_STEER, async (_e, id: string, message: string) => {
    const text = String(message || '').trim()
    if (!text) return { ok: false as const, error: '缺少转向说明' }
    try {
      const note = await sendSubAgentMessage(settings, String(id || ''), text)
      return { ok: true as const, note }
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) }
    }
  })

  /** chat:send — 转发至 Turn 管线 executeUserInput，流式推送 chunk。 */
  ipcMain.handle(
    IPC.SEND_MESSAGE,
    async (
      event,
      userText: string,
      history: ChatMessage[],
      attachments: ChatAttachment[] = [],
      conversationId?: string,
      options?: { worktreePath?: string | null; goal?: string | null }
    ) => {
      const send = (chunk: StreamChunk) => {
        broadcastToRenderers('chat:stream', {
          ...chunk,
          conversationId: chunk.conversationId ?? conversationId
        })
      }
      const sessionApprovals = approvalRegistry.get(conversationId)
      // 发送前刷新过期的 SuperGrok token；失败直接回错误
      try {
        settings = await ensureXaiSubscriptionFresh(
          normalizeSettings(await loadSettings(), app.getPath('home'))
        )
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.warn('[chat:send] ensureXaiSubscriptionFresh failed', msg)
        send({ type: 'error', error: msg, conversationId })
        send({ type: 'done', conversationId })
        return
      }
      preventSleepHolds += 1
      syncPreventSleep()
      try {
        await executeUserInput({
          settings,
          history,
          userText,
          attachments,
          conversationId,
          worktreePath: options?.worktreePath,
          threadGoal: options?.goal,
          sessionApprovals,
          onApproval: approvalHandler,
          send,
          reloadSettings: async () => {
            let next = normalizeSettings(await loadSettings(), app.getPath('home'))
            try {
              next = await ensureXaiSubscriptionFresh(next)
            } catch (e) {
              // 轮次中途刷新失败：继续用当前 next，让 API 层报错
              console.warn('[chat:send] mid-turn refresh failed', e)
            }
            settings = next
            return settings
          }
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error('[chat:send] executeUserInput threw', msg)
        send({ type: 'error', error: msg, conversationId })
        send({ type: 'done', conversationId })
      } finally {
        preventSleepHolds = Math.max(0, preventSleepHolds - 1)
        syncPreventSleep()
      }
    }
  )

  const reviewIo = (): GitReviewIo => ({
    runGit,
    unlink,
    rmDir: (abs) => rm(abs, { recursive: true, force: true }),
    stat: async (abs) => {
      try {
        const s = await stat(abs)
        return { isFile: s.isFile(), isDirectory: s.isDirectory() }
      } catch {
        return null
      }
    }
  })

  /** 工作区 git 变更列表（右侧 Changes 面板；可探附加 Git 根） */
  ipcMain.handle(IPC.GIT_STATUS_CHANGES, async (_e, cwd: string) => {
    const empty = {
      isRepo: false,
      branch: '',
      files: [] as { status: string; path: string; raw: string }[],
      added: 0,
      removed: 0,
      toplevel: '',
      commonDir: ''
    }
    try {
      const root = path.resolve(String(cwd || ''))
      if (!root) return empty
      const branch = (await runGit(root, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
      const toplevel = (await runGit(root, ['rev-parse', '--show-toplevel'])).trim()
      let commonDir = (await runGit(root, ['rev-parse', '--git-common-dir'])).trim()
      if (commonDir && !path.isAbsolute(commonDir)) {
        commonDir = path.resolve(root, commonDir)
      }
      const porcelain = await runGit(root, ['status', '--porcelain', '-uall'], { trim: false })
      const files = parseGitStatusPorcelain(porcelain)
      let added = 0
      let removed = 0
      try {
        const numstat = await runGit(root, ['diff', '--numstat', 'HEAD'], { trim: false })
        const stats = parseGitNumstat(numstat)
        added = stats.added
        removed = stats.removed
      } catch {
        // 还没有 HEAD（空仓）
      }
      return { isRepo: true, branch, files, added, removed, toplevel, commonDir }
    } catch {
      return empty
    }
  })

  ipcMain.handle(
    IPC.GIT_FILE_DIFF,
    async (
      _e,
      cwd: string,
      filePath: string,
      status = 'M',
      scope: 'unstaged' | 'staged' | 'branch' | 'commit' = 'unstaged',
      rev = ''
    ) => {
      const root = path.resolve(String(cwd || ''))
      const rel = String(filePath || '').replace(/^[/\\]+/, '')
      if (!root || !rel) {
        return { ok: false, path: rel, status, error: '缺少路径' }
      }
      const abs = path.resolve(root, rel)
      if (abs !== root && !abs.startsWith(root + path.sep)) {
        return { ok: false, path: rel, status, error: '路径超出工作区' }
      }
      const posix = rel.replaceAll('\\', '/')
      const show = async (spec: string) => {
        try {
          return await runGit(root, ['show', spec])
        } catch {
          return null
        }
      }
      const headText = await show(`HEAD:${posix}`)
      const indexText = await show(`:${posix}`)
      let worktreeText: string | null = null
      try {
        const buf = await readFile(abs)
        if (buf.includes(0)) {
          return { ok: false, path: rel, status, binary: true, error: '二进制文件，无法预览 diff' }
        }
        if (buf.byteLength > 400_000) {
          return { ok: false, path: rel, status, error: '文件过大，请在编辑器中查看' }
        }
        worktreeText = buf.toString('utf8')
      } catch {
        worktreeText = null
      }

      if (scope === 'branch') {
        const { base } = await listBranchChanges({ cwd: root, runGit })
        if (!base) {
          return { ok: false, path: rel, status, error: '无法检测基线分支' }
        }
        const oldText = (await show(`${base}:${posix}`)) ?? ''
        const newText = (await show(`HEAD:${posix}`)) ?? ''
        return {
          ok: true,
          path: rel,
          status,
          diff: diffFromGitTexts({ path: rel, status, oldText, newText })
        }
      }

      if (scope === 'commit') {
        const sha = String(rev || '').trim()
        if (!sha) {
          return { ok: false, path: rel, status, error: '缺少 commit' }
        }
        const oldText = (await show(`${sha}^:${posix}`)) ?? ''
        const newText = (await show(`${sha}:${posix}`)) ?? ''
        return {
          ok: true,
          path: rel,
          status,
          diff: diffFromGitTexts({ path: rel, status, oldText, newText })
        }
      }

      const oldText = scope === 'staged' ? headText : (indexText ?? headText)
      let newText = ''
      if (scope === 'staged') {
        newText = indexText ?? ''
      } else if (worktreeText != null) {
        newText = worktreeText
      } else if (!isDeletedGitChange(status) && indexText == null && headText == null) {
        return { ok: false, path: rel, status, error: '无法读取工作区文件' }
      }

      const effectiveStatus =
        scope === 'unstaged' && indexText == null && headText == null && worktreeText != null
          ? '??'
          : status
      return {
        ok: true,
        path: rel,
        status: effectiveStatus,
        diff: diffFromGitTexts({ path: rel, status: effectiveStatus, oldText, newText })
      }
    }
  )

  ipcMain.handle(
    IPC.GIT_REVIEW_ACTION,
    async (_e, cwd: string, action: GitReviewAction, paths?: string[]) => {
      const root = path.resolve(String(cwd || ''))
      if (!root) return { ok: false as const, error: '缺少工作区' }
      const allowed: GitReviewAction[] = ['stage', 'unstage', 'revert']
      if (!allowed.includes(action)) {
        return { ok: false as const, error: '未知审查动作' }
      }
      return applyGitReviewAction({
        cwd: root,
        action,
        paths: Array.isArray(paths) ? paths.map(String) : undefined,
        io: reviewIo()
      })
    }
  )

  ipcMain.handle(
    IPC.GIT_HUNK_ACTION,
    async (
      _e,
      cwd: string,
      payload: {
        action: GitReviewAction
        path: string
        patch: string
        scope?: 'unstaged' | 'staged'
      }
    ) => {
      const root = path.resolve(String(cwd || ''))
      if (!root) return { ok: false as const, error: '缺少工作区' }
      const allowed: GitReviewAction[] = ['stage', 'unstage', 'revert']
      if (!allowed.includes(payload?.action)) {
        return { ok: false as const, error: '未知审查动作' }
      }
      return applyGitHunkAction({
        cwd: root,
        action: payload.action,
        path: String(payload.path || ''),
        patch: String(payload.patch || ''),
        scope: payload.scope === 'staged' ? 'staged' : 'unstaged',
        io: reviewIo()
      })
    }
  )

  ipcMain.handle(IPC.GIT_COMMIT, async (_e, cwd: string, message: string) => {
    const root = path.resolve(String(cwd || ''))
    if (!root) return { ok: false as const, error: '缺少工作区' }
    return commitStagedChanges({ cwd: root, message: String(message || ''), io: reviewIo() })
  })

  ipcMain.handle(IPC.GIT_PUSH, async (_e, cwd: string) => {
    const root = path.resolve(String(cwd || ''))
    if (!root) return { ok: false as const, error: '缺少工作区' }
    const git = normalizeSettings(await loadSettings(), app.getPath('home'))
    return pushCurrentBranch({
      cwd: root,
      io: reviewIo(),
      forceWithLease: git.gitForceWithLease === true
    })
  })

  const runCommand = (cwd: string, command: string, args: string[]): Promise<string> =>
    new Promise((resolve, reject) => {
      const child = spawn(command, args, { cwd })
      let stdout = ''
      let stderr = ''
      const timer = setTimeout(() => {
        child.kill('SIGTERM')
        reject(new Error(`${command} timed out`))
      }, 60_000)
      child.stdout.on('data', (chunk) => {
        stdout += String(chunk)
      })
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk)
      })
      child.on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        const out = stdout || stderr || ''
        if (code === 0) resolve(out)
        else reject(new Error(stderr.trim() || out.trim() || `${command} failed (${code})`))
      })
    })

  ipcMain.handle(IPC.GIT_PR_CONTEXT, async (_e, cwd: string) => {
    const root = path.resolve(String(cwd || ''))
    if (!root) return { ok: false as const, error: '缺少工作区' }
    return loadPullRequestContext({ cwd: root, run: runCommand })
  })

  ipcMain.handle(
    IPC.GIT_PR_REVIEW,
    async (_e, cwd: string, comments: unknown) => {
      const root = path.resolve(String(cwd || ''))
      if (!root) return { ok: false as const, error: '缺少工作区', posted: 0 }
      const pr = await loadPullRequestContext({ cwd: root, run: runCommand })
      if (!pr.ok) return { ok: false as const, error: pr.error, posted: 0 }
      const parts = parsePrUrlParts(pr.context.url)
      if (!parts) return { ok: false as const, error: '无法解析 PR 地址', posted: 0 }
      const drafts = localCommentsForGithub(Array.isArray(comments) ? comments : [])
      return postPullRequestLineComments({
        cwd: root,
        owner: parts.owner,
        repo: parts.repo,
        number: parts.number,
        comments: drafts,
        run: runCommand
      })
    }
  )

  ipcMain.handle(
    IPC.GIT_CREATE_PR,
    async (_e, cwd: string, payload?: { title?: string; body?: string; base?: string }) => {
      const root = path.resolve(String(cwd || ''))
      if (!root) return { ok: false as const, error: '缺少工作区' }
      const detected = await listBranchChanges({ cwd: root, runGit })
      return createPullRequest({
        cwd: root,
        title: String(payload?.title || ''),
        body: payload?.body,
        base: payload?.base || detected.base || undefined,
        run: runCommand
      })
    }
  )

  ipcMain.handle(IPC.GIT_CREATE_BRANCH, async (_e, cwd: string, name: string) => {
    const root = path.resolve(String(cwd || ''))
    if (!root) return { ok: false as const, error: '缺少工作区' }
    const git = normalizeSettings(await loadSettings(), app.getPath('home'))
    return createNamedBranch({
      cwd: root,
      name: String(name || ''),
      prefix: git.gitBranchPrefix,
      io: reviewIo()
    })
  })

  ipcMain.handle(IPC.GIT_BRANCH_CHANGES, async (_e, cwd: string) => {
    const root = path.resolve(String(cwd || ''))
    if (!root) return { base: null, files: [] }
    try {
      await runGit(root, ['rev-parse', '--is-inside-work-tree'])
    } catch {
      return { base: null, files: [] }
    }
    return listBranchChanges({ cwd: root, runGit })
  })

  ipcMain.handle(IPC.GIT_COMMIT_CHANGES, async (_e, cwd: string, sha?: string) => {
    const root = path.resolve(String(cwd || ''))
    if (!root) return { commits: [], sha: '', files: [] }
    try {
      await runGit(root, ['rev-parse', '--is-inside-work-tree'])
    } catch {
      return { commits: [], sha: '', files: [] }
    }
    const commits = await listRecentCommits({ cwd: root, runGit })
    const want = String(sha || '').trim()
    const resolved =
      commits.find((c) => c.sha === want || (want.length >= 7 && c.sha.startsWith(want)))?.sha ||
      want ||
      commits[0]?.sha ||
      ''
    const files = resolved
      ? (await listCommitChanges({ cwd: root, sha: resolved, runGit })).files
      : []
    return { commits, sha: resolved, files }
  })

  ipcMain.handle(
    IPC.WORKSPACE_PREPARE_WORKTREE,
    async (
      _e,
      cwd: string,
      conversationId: string,
      opts?: { baseRef?: string; keep?: number }
    ) => {
      const wt = normalizeSettings(await loadSettings(), app.getPath('home'))
      return prepareThreadWorktree({
        workspacePath: String(cwd || ''),
        conversationId: String(conversationId || ''),
        baseRef: typeof opts?.baseRef === 'string' ? opts.baseRef : undefined,
        home: app.getPath('home'),
        keep: wt.worktreeKeepCount,
        root: wt.worktreeRoot
      })
    }
  )

  ipcMain.handle(
    IPC.WORKSPACE_CREATE_PERMANENT_WORKTREE,
    async (_e, cwd: string, name: string, opts?: { baseRef?: string }) => {
      const wt = normalizeSettings(await loadSettings(), app.getPath('home'))
      return createPermanentWorktree({
        workspacePath: String(cwd || ''),
        name: String(name || ''),
        baseRef: typeof opts?.baseRef === 'string' ? opts.baseRef : undefined,
        home: app.getPath('home'),
        root: wt.worktreeRoot
      })
    }
  )

  ipcMain.handle(
    IPC.WORKSPACE_REMOVE_WORKTREE,
    async (_e, cwd: string, conversationId: string) => {
      const wt = normalizeSettings(await loadSettings(), app.getPath('home'))
      return removeManagedWorktree({
        workspacePath: String(cwd || ''),
        conversationId: String(conversationId || ''),
        home: app.getPath('home'),
        root: wt.worktreeRoot
      })
    }
  )

  ipcMain.handle(IPC.INIT_AGENTS_MD, async (_e, workspace: string) => {
    return initAgentsMdFile(String(workspace || ''))
  })

  ipcMain.handle(IPC.GET_PERSONAL_AGENTS_MD, async () => readPersonalAgentsMd(app.getPath('home')))
  ipcMain.handle(IPC.SAVE_PERSONAL_AGENTS_MD, async (_e, content: string) =>
    writePersonalAgentsMd(String(content ?? ''), app.getPath('home'))
  )

  ipcMain.handle(IPC.GET_PLAN_MODE, (_e, conversationId?: string) =>
    getHarnessPhase(typeof conversationId === 'string' ? conversationId : undefined)
  )
  ipcMain.handle(IPC.SET_PLAN_MODE, (_e, conversationId: string, enabled: boolean) => {
    const id = String(conversationId || '')
    if (enabled) {
      enterPlanMode(id)
      return 'plan' as const
    }
    exitPlanMode({ conversationId: id })
    return 'normal' as const
  })

  ipcMain.handle(IPC.MEMORY_LIST, async (_e, workspaceId: string) => {
    const id = String(workspaceId || '')
    if (!id) return []
    try {
      const [projectId, sessionId] = await Promise.all([
        getWorkspaceProjectId(id),
        getActiveSessionId(id)
      ])
      const rows = await listMemoriesExact({
        projectId,
        workspaceId: id,
        sessionId,
        limit: 24
      })
      return rows.map((r) => ({
        id: r.id,
        scope: r.scope,
        kind: r.kind,
        content: r.content
      }))
    } catch {
      return []
    }
  })

  ipcMain.handle(IPC.WORKSPACE_INSPECT_WORKTREE, async (_e, dest: string) => {
    return inspectWorktreePath(String(dest || ''))
  })

  ipcMain.handle(
    IPC.MCP_STATUS,
    async (_e, workspace: string, verbose = false) => {
      const cwd = String(workspace || '')
      const servers = await loadMcpConfig(cwd)
      if (!verbose) {
        return servers.map((s) => ({
          name: s.name,
          command: s.command,
          args: s.args
        }))
      }
      const tools = await listMcpToolsQuick(cwd).catch(() => [])
      return servers.map((s) => {
        const owned = tools.filter((t) => t.server === s.name)
        const failed = owned.find((t) => t.name === '(connection failed)')
        return {
          name: s.name,
          command: s.command,
          args: s.args,
          error: failed?.description,
          tools: owned.filter((t) => !t.name.startsWith('(')).map((t) => t.name)
        }
      })
    }
  )

  ipcMain.handle(
    IPC.GIT_HANDOFF,
    async (
      _e,
      payload: { direction?: 'to_local' | 'to_worktree'; localCwd?: string; worktreePath?: string }
    ) => {
      return handoffCheckout({
        direction: payload?.direction === 'to_worktree' ? 'to_worktree' : 'to_local',
        localCwd: String(payload?.localCwd || ''),
        worktreePath: String(payload?.worktreePath || ''),
        io: {
          ...reviewIo(),
          readFile,
          writeFile,
          mkdirp: (abs) => mkdir(abs, { recursive: true }).then(() => undefined)
        }
      })
    }
  )
}

/** 应用就绪：加载设置、注册 IPC、创建主窗口。 */
app.whenReady().then(async () => {
  if (process.platform !== 'darwin') {
    dialog.showErrorBox('Sharker', 'Sharker 仅支持 macOS。')
    app.quit()
    return
  }

  installApplicationMenu()
  const icon = resolveAppIcon()
  if (icon) applyAppIcon(icon)

  settings = await loadSettings()
  settings = normalizeSettings(settings, app.getPath('home'))
  // 全局对话目录：~/.sharker/global
  try {
    fs.mkdirSync(globalWorkspacePath(app.getPath('home')), { recursive: true })
  } catch (e) {
    console.warn('[workspace] ensure global dir failed', e)
  }
  await saveSettings(settings)
  try {
    await hydrateSubAgents()
  } catch (e) {
    console.warn('[subagents] hydrate failed', e)
  }
  registerIpc()
  createWindow()
  const argvLink = process.argv.find((a) => a.startsWith(`${DEEPLINK_SCHEME}://`))
  if (argvLink) broadcastDeeplink(argvLink)

  void initMemorySystem(app.getPath('home'), settings).catch((e) =>
    console.warn('[memory] boot init failed', e)
  )

  const bootWorkspace = getActiveWorkspacePath(settings) ?? ''
  if (settings.computerUseEnabled) {
    void ensureComputerUseReady(bootWorkspace).catch((e) =>
      console.warn('[feature-use] computer boot setup', e)
    )
  }
  if (settings.browserUseEnabled) {
    void ensureBrowserUseReady(bootWorkspace, app.getAppPath()).catch((e) =>
      console.warn('[feature-use] browser boot setup', e)
    )
  }

  startAutomationScheduler(async (job) => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('automation:run', job)
  })

  app.on('before-quit', () => {
    killAllTerminals()
    try {
      stopLsp()
    } catch (e) {
      console.warn('[lsp] stop failed', e)
    }
    void closeMemoryDb()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  /* macOS: keep app alive until quit from Dock / Cmd+Q */
})
