/// <reference types="electron-vite/node" />
/**
 * Electron 主进程入口：窗口生命周期、全部 IPC 注册与 Agent 对话调度。
 * @see electron/README.md
 */
import { app, BrowserWindow, ipcMain, dialog, Menu, nativeImage, shell, safeStorage } from 'electron'

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('class', 'sharker')
}
import fs from 'fs'
import path from 'path'
import appIconBundled from '../../resources/icon.png?asset'
import { IPC } from '../../shared/ipc'
import { loadSettings, saveSettings } from '../settings-store'
import type { AppSettings, ApprovalRequest, ChatMessage, StreamChunk } from '../../shared/types'
import { generateTitle, type ApprovalHandler } from '../../agent/loop'
import { executeUserInput, abortActiveTurn } from '../../agent/pipeline'
import { initMemorySystem, onSettingsChanged } from '../../agent/memory/init'
import { closeMemoryDb } from '../../agent/memory/db'
import { testProvider, simpleCompletion } from '../../providers/openai'
import { cloneSkillRepo } from '../../skills/loader'
import { normalizeSettings, getActiveWorkspacePath } from '../../shared/workspace'
import type { Conversation } from '../../shared/conversation'
import {
  createConversationOnDisk,
  deleteConversation,
  listWorkspaceConversations,
  loadConversation,
  saveConversation,
  setActiveConversation
} from '../conversations-store'
import { readMcpConfig, writeMcpConfig } from '../../tools/services/mcp-config-io'
import { listMcpPluginStates, setMcpPluginEnabled } from '../../tools/services/mcp-plugin-store'
import {
  disableBrowserUse,
  disableComputerUse,
  ensureBrowserUseReady,
  ensureComputerUseReady
} from '../../tools/services/feature-use-setup'
import { listMcpTools } from '../../tools/services/mcp-registry'
import { invalidateMcpToolPool } from '../../tools/services/mcp-tool-pool'
import { gatherComputerUseStatus } from '../../shared/computer-use-status'
import {
  gatherBrowserUseStatus,
  runBrowserUseManifestInstall
} from '../../shared/browser-use-status'
import { compressContextForce } from '../../shared/context-compress'
import { getUsageHistory } from '../../shared/token-usage-store'
import { buildWorkspaceTree } from '../../shared/workspace-tree'
import { runGit } from '../../tools/shared/git-runner'
import {
  createTerminal,
  killAllTerminals,
  killTerminal,
  resizeTerminal,
  writeTerminal
} from './terminal-manager'
import { listAutomations, saveAutomations, startAutomationScheduler } from './automation-scheduler'
import { loadHooks, saveHooks, runHooks } from '../../agent/hooks/runner'
import type { HookEntry } from '../../agent/hooks/runner'
import { importCodexCredentials, loadOAuthGptMeta } from '../../shared/oauth-gpt'
import { createRemoteRoom, loadRemoteCollab } from '../../shared/remote-collab'
import { getLspStatus, startTypescriptLsp, stopLsp } from '../../tools/services/lsp-client'
import { installLinuxDesktopEntry } from '../linux-desktop'

let mainWindow: BrowserWindow | null = null
let settings: AppSettings

const pendingApprovals = new Map<
  string,
  { resolve: (v: boolean) => void; reject: (e: Error) => void }
>()

let cachedAppIcon: Electron.NativeImage | undefined
let cachedAppIconPath: string | undefined

/** 从磁盘路径加载 NativeImage，Linux 下自动放大 */
function loadIconFromPath(filePath: string): Electron.NativeImage | undefined {
  if (!filePath || !fs.existsSync(filePath)) return undefined
  try {
    let img = nativeImage.createFromPath(filePath)
    if (img.isEmpty()) return undefined
    if (process.platform === 'linux') {
      const { width, height } = img.getSize()
      if (width !== height || width < 128) {
        img = img.resize({ width: 256, height: 256, quality: 'best' })
      }
    }
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
      cachedAppIconPath = p
      return img
    }
  }
  return undefined
}

/** 将图标应用到 macOS Dock */
function applyAppIcon(icon: Electron.NativeImage): void {
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(icon)
  }
}

/** 创建主窗口并加载渲染进程（开发 URL 或打包 HTML）。 */
function createWindow(): void {
  const isMac = process.platform === 'darwin'
  const customChrome = !isMac
  const icon = resolveAppIcon()

  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    title: 'Sharker',
    backgroundColor: customChrome ? '#00000000' : '#dce8f8',
    transparent: customChrome,
    frame: isMac,
    titleBarStyle: isMac ? 'hiddenInset' : undefined,
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

  mainWindow.setMenuBarVisibility(false)

  if (icon) {
    mainWindow.setIcon(icon)
  }

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

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }
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

/** 高危工具调用审批：向渲染进程推送请求并等待用户响应。 */
const approvalHandler: ApprovalHandler = (req) => {
  return new Promise((resolve, reject) => {
    pendingApprovals.set(req.id, { resolve, reject })
    mainWindow?.webContents.send('chat:approval', req)
  })
}

/** 注册全部 IPC handler（设置、对话、窗口、聊天等）。 */
function registerIpc(): void {
  ipcMain.handle(IPC.GET_SETTINGS, async () => settings)

  ipcMain.handle(IPC.SAVE_SETTINGS, async (_e, next: AppSettings) => {
    const prev = settings
    settings = normalizeSettings(next, app.getPath('home'))
    await saveSettings(settings)
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
    return true
  })

  ipcMain.handle(
    IPC.TEST_PROVIDER,
    async (_e, providerId: string, draft?: AppSettings) => {
      const snapshot = draft
        ? normalizeSettings(draft, app.getPath('home'))
        : settings
      return testProvider(snapshot, providerId)
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
    IPC.SET_ACTIVE_CONVERSATION,
    async (_e, workspaceId: string, conversationId: string | null) => {
      const p = workspacePathById(workspaceId)
      await setActiveConversation(p, workspaceId, conversationId)
      return true
    }
  )

  ipcMain.handle(
    IPC.CREATE_CONVERSATION,
    async (_e, workspaceId: string) => {
      const p = workspacePathById(workspaceId)
      return createConversationOnDisk(p, workspaceId)
    }
  )

  ipcMain.handle(IPC.IMPORT_SKILL_REPO, async (_e, url: string) => {
    const path = await cloneSkillRepo(url)
    if (!settings.skillRepoUrls.includes(url)) {
      settings.skillRepoUrls.push(url)
      await saveSettings(settings)
    }
    return path
  })

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

  ipcMain.handle(IPC.APPROVAL_RESPONSE, async (_e, id: string, approved: boolean) => {
    const pending = pendingApprovals.get(id)
    if (pending) {
      pendingApprovals.delete(id)
      pending.resolve(approved)
    }
  })

  ipcMain.handle(IPC.ABORT_CHAT, async () => {
    abortActiveTurn()
  })

  ipcMain.handle(IPC.WINDOW_MINIMIZE, () => mainWindow?.minimize())
  ipcMain.handle(IPC.WINDOW_MAXIMIZE, () => {
    if (!mainWindow) return
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  })
  ipcMain.handle(IPC.WINDOW_CLOSE, () => mainWindow?.close())

  ipcMain.handle(IPC.OPEN_EXTERNAL, async (_e, url: string) => {
    if (!isSafeExternalUrl(url)) return false
    await shell.openExternal(url)
    return true
  })

  ipcMain.handle(IPC.GET_MCP_CONFIG, async (_e, workspace: string) => {
    const { raw, path: configPath } = await readMcpConfig(workspace)
    return { raw, path: configPath }
  })

  ipcMain.handle(IPC.SAVE_MCP_CONFIG, async (_e, targetPath: string, raw: string) => {
    try {
      const parsed = JSON.parse(raw) as { servers?: unknown }
      if (!Array.isArray(parsed.servers)) throw new Error('servers must be an array')
      await writeMcpConfig(targetPath, parsed as { servers: import('../../tools/services/mcp-registry').McpServerConfig[] })
      invalidateMcpToolPool()
      return true
    } catch {
      return false
    }
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

  ipcMain.handle(IPC.LIST_MCP_PLUGINS, async (_e, workspace: string) => {
    return listMcpPluginStates(workspace)
  })

  ipcMain.handle(
    IPC.TOGGLE_MCP_PLUGIN,
    async (_e, workspace: string, pluginId: string, enabled: boolean) => {
      await setMcpPluginEnabled(workspace, pluginId, enabled)
      return listMcpPluginStates(workspace)
    }
  )

  ipcMain.handle(IPC.COMPRESS_CONTEXT, async (_e, history: ChatMessage[]) => {
    const summarize = async (s: AppSettings, transcript: string) =>
      simpleCompletion(s, [{ role: 'user', content: transcript }])
    const result = await compressContextForce(settings, history, summarize)
    return result
  })

  ipcMain.handle(IPC.GET_TOKEN_USAGE, async (_e, days = 365) => {
    return getUsageHistory(days)
  })

  ipcMain.handle(IPC.WORKSPACE_TREE, async (_e, workspace: string, directoriesOnly = false) => {
    return buildWorkspaceTree(workspace, { directoriesOnly })
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

  ipcMain.handle(IPC.GIT_BRANCH_INFO, async (_e, cwd: string) => {
    try {
      const branch = (await runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
      const porcelain = await runGit(cwd, ['status', '--porcelain'])
      return { isRepo: true, branch, dirty: porcelain.trim().length > 0 }
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

  ipcMain.handle(IPC.TERMINAL_CREATE, async (event, cwd: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('no window')
    return createTerminal(win, cwd)
  })

  ipcMain.handle(IPC.TERMINAL_WRITE, (_e, id: string, data: string) => {
    writeTerminal(id, data)
  })

  ipcMain.handle(IPC.TERMINAL_RESIZE, (_e, id: string, cols: number, rows: number) => {
    resizeTerminal(id, cols, rows)
  })

  ipcMain.handle(IPC.TERMINAL_KILL, (_e, id: string) => {
    killTerminal(id)
  })

  ipcMain.handle(IPC.LIST_AUTOMATIONS, async () => listAutomations())
  ipcMain.handle(IPC.SAVE_AUTOMATIONS, async (_e, jobs) => {
    await saveAutomations(jobs)
    return true
  })

  ipcMain.handle(IPC.LIST_HOOKS, async () => loadHooks())
  ipcMain.handle(IPC.SAVE_HOOKS, async (_e, hooks: HookEntry[]) => {
    await saveHooks(hooks)
    return true
  })

  ipcMain.handle(IPC.OAUTH_GPT_META, async () => loadOAuthGptMeta())
  ipcMain.handle(IPC.OAUTH_GPT_START, async () => {
    const encrypt =
      safeStorage.isEncryptionAvailable()
        ? (plain: string) => safeStorage.encryptString(plain).toString('base64')
        : undefined

    const result = await importCodexCredentials(encrypt)
    if (!result.ok) return { ok: false, message: result.message }

    // 可选：创建 OpenAI 兼容 provider 预设，便于在对话中选择
    if (result.accessToken) {
      const codexProviderId = 'codex-chatgpt'
      const hasPreset = settings.providers.some((p) => p.id === codexProviderId)
      if (!hasPreset) {
        settings = {
          ...settings,
          providers: [
            ...settings.providers,
            {
              id: codexProviderId,
              name: 'ChatGPT (Codex)',
              baseUrl: 'https://api.openai.com/v1',
              apiKey: result.accessToken,
              model: 'gpt-4o'
            }
          ]
        }
        await saveSettings(settings)
      }
    }

    return { ok: true, message: result.message, email: result.email }
  })

  ipcMain.handle(IPC.REMOTE_COLLAB_GET, async () => loadRemoteCollab())
  ipcMain.handle(IPC.REMOTE_COLLAB_CREATE, async (_e, name: string) => createRemoteRoom(name))

  ipcMain.handle(IPC.LSP_START, async (_e, workspace: string) => startTypescriptLsp(workspace))
  ipcMain.handle(IPC.LSP_STATUS, async () => getLspStatus())
  ipcMain.handle(IPC.LSP_STOP, async () => {
    stopLsp()
    return true
  })

  ipcMain.handle(IPC.TEST_MCP_CONFIG, async (_e, workspace: string) => {
    try {
      invalidateMcpToolPool()
      const tools = await listMcpTools(workspace)
      const names = tools.filter((t) => !t.name.startsWith('('))
      if (!names.length) {
        return { ok: true, message: '已连接，但未发现工具（或配置为空）' }
      }
      return {
        ok: true,
        message: `发现 ${names.length} 个工具，例如 ${names.slice(0, 5).map((t) => `${t.server}/${t.name}`).join(', ')}`
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false, message: msg }
    }
  })

  /** chat:send — 转发至 Turn 管线 executeUserInput，流式推送 chunk。 */
  ipcMain.handle(
    IPC.SEND_MESSAGE,
    async (event, userText: string, history: ChatMessage[]) => {
      const send = (chunk: StreamChunk) => {
        event.sender.send('chat:stream', chunk)
      }
      await executeUserInput({
        settings,
        history,
        userText,
        onApproval: approvalHandler,
        send,
        reloadSettings: async () => {
          settings = normalizeSettings(await loadSettings(), app.getPath('home'))
          return settings
        }
      })
    }
  )
}

/** 应用就绪：加载设置、注册 IPC、创建主窗口。 */
app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)
  const icon = resolveAppIcon()
  if (icon) {
    applyAppIcon(icon)
    if (process.platform === 'linux' && cachedAppIconPath) {
      installLinuxDesktopEntry(cachedAppIconPath)
    }
  }

  settings = await loadSettings()
  settings = normalizeSettings(settings, app.getPath('home'))
  await saveSettings(settings)
  await initMemorySystem(app.getPath('home'), settings)
  registerIpc()
  createWindow()

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
    stopLsp()
    void closeMemoryDb()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
