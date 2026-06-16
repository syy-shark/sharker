/// <reference types="electron-vite/node" />
/**
 * Electron 主进程入口：窗口生命周期、全部 IPC 注册与 Agent 对话调度。
 * @see electron/README.md
 */
import { app, BrowserWindow, ipcMain, dialog, Menu, nativeImage, shell } from 'electron'

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
import { testProvider } from '../../providers/openai'
import { cloneSkillRepo } from '../../skills/loader'
import { normalizeSettings } from '../../shared/workspace'
import type { Conversation } from '../../shared/conversation'
import {
  createConversationOnDisk,
  deleteConversation,
  listWorkspaceConversations,
  loadConversation,
  saveConversation,
  setActiveConversation
} from '../conversations-store'
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
      sandbox: true
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
    settings = normalizeSettings(next, app.getPath('home'))
    await saveSettings(settings)
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
      await deleteConversation(p, conversationId)
      return true
    }
  )

  ipcMain.handle(
    IPC.SET_ACTIVE_CONVERSATION,
    async (_e, workspaceId: string, conversationId: string | null) => {
      const p = workspacePathById(workspaceId)
      await setActiveConversation(p, conversationId)
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
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
