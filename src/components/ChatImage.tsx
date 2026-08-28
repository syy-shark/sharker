/**
 * 对话渲染图：悬停复制 / 保存；工作区相对路径经 readFileDataUrl 成图。
 * 对标 Codex Save or copy rendered images，以及在同一工作区打开图片。
 * @see src/components/ARCH.md
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import { Check, Copy, Download } from 'lucide-react'
import {
  canExportChatImage,
  chatImageAspectStyle,
  isRemoteChatImageSrc,
  isWorkspaceChatImageSrc,
  readCachedChatImageSize,
  readCachedWorkspaceImageDataUrl,
  resolveWorkspaceChatImagePath,
  writeCachedChatImageSize,
  writeCachedWorkspaceImageDataUrl,
  type ChatImageExportInput
} from '../../shared/chat-image'
import { dispatchOpenWorkspaceFile } from '../lib/open-workspace-file'
import './MessageActions.css'
import './ChatImage.css'

type ChatImageWorkspaceValue = {
  workspacePath: string
  extraRoots: string[]
}

const ChatImageWorkspaceContext = createContext<ChatImageWorkspaceValue>({
  workspacePath: '',
  extraRoots: []
})

const workspaceImageInflight = new Map<string, Promise<string | null>>()

function loadWorkspaceImageDataUrl(absPath: string): Promise<string | null> {
  const cached = readCachedWorkspaceImageDataUrl(absPath)
  if (cached) return Promise.resolve(cached)
  const pending = workspaceImageInflight.get(absPath)
  if (pending) return pending
  const task = (async () => {
    if (!window.sharker?.readFileDataUrl) return null
    const res = await window.sharker.readFileDataUrl(absPath)
    if (!res.ok || !res.dataUrl.startsWith('data:image/')) return null
    writeCachedWorkspaceImageDataUrl(absPath, res.dataUrl)
    return res.dataUrl
  })().finally(() => {
    workspaceImageInflight.delete(absPath)
  })
  workspaceImageInflight.set(absPath, task)
  return task
}

/** 对话树提供当前工作区 / 附加根，直播与历史行共用 */
export function ChatImageWorkspaceProvider({
  workspacePath,
  extraRoots = [],
  children
}: {
  workspacePath: string
  extraRoots?: string[]
  children: ReactNode
}) {
  const value = useMemo(
    () => ({ workspacePath, extraRoots }),
    [workspacePath, extraRoots]
  )
  return (
    <ChatImageWorkspaceContext.Provider value={value}>{children}</ChatImageWorkspaceContext.Provider>
  )
}

export function ChatImage({
  src,
  alt,
  title,
  filePath,
  name
}: {
  src: string
  alt?: string
  title?: string
  filePath?: string
  name?: string
}) {
  const { workspacePath, extraRoots } = useContext(ChatImageWorkspaceContext)
  const remote = isRemoteChatImageSrc(src)
  const workspaceSrc = isWorkspaceChatImageSrc(src)
  const absPath = workspaceSrc
    ? resolveWorkspaceChatImagePath(src, workspacePath, extraRoots)
    : ''
  const [workspaceDataUrl, setWorkspaceDataUrl] = useState(() =>
    absPath ? readCachedWorkspaceImageDataUrl(absPath) : null
  )
  const [failed, setFailed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [, setSizeTick] = useState(0)

  useEffect(() => {
    if (!workspaceSrc || !absPath) {
      setWorkspaceDataUrl(null)
      setFailed(false)
      return
    }
    const cached = readCachedWorkspaceImageDataUrl(absPath)
    if (cached) {
      setWorkspaceDataUrl(cached)
      setFailed(false)
      return
    }
    let cancelled = false
    setWorkspaceDataUrl(null)
    setFailed(false)
    void loadWorkspaceImageDataUrl(absPath).then((dataUrl) => {
      if (cancelled) return
      if (!dataUrl) {
        setFailed(true)
        return
      }
      setWorkspaceDataUrl(dataUrl)
    })
    return () => {
      cancelled = true
    }
  }, [absPath, workspaceSrc])

  const displaySrc = remote ? src : workspaceDataUrl ?? ''
  const resolvedFilePath = filePath?.trim() || (absPath || undefined)
  const known =
    readCachedChatImageSize(src) ??
    readCachedChatImageSize(displaySrc) ??
    readCachedChatImageSize(absPath)
  const aspect = chatImageAspectStyle(known)
  const input: ChatImageExportInput = {
    src: displaySrc || src,
    filePath: resolvedFilePath,
    name,
    alt
  }
  const canExport = canExportChatImage(input)
  const pending = !known && (remote || (workspaceSrc && !failed))

  const copy = async () => {
    if (!canExport || !window.sharker?.copyChatImage) return
    const result = await window.sharker.copyChatImage(input)
    if (!result?.ok) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  const save = async () => {
    if (!canExport || !window.sharker?.saveChatImage) return
    await window.sharker.saveChatImage(input)
  }

  if (!remote && !workspaceSrc) return null
  if (workspaceSrc && failed) return null

  const openWorkspace = () => {
    if (!workspaceSrc) return
    dispatchOpenWorkspaceFile({ path: src })
  }

  return (
    <span
      className={`chat-image${pending ? ' chat-image--pending' : ''}${
        workspaceSrc ? ' chat-image--workspace' : ''
      }`}
    >
      {displaySrc ? (
        <img
          src={displaySrc}
          alt={alt ?? ''}
          title={title}
          loading="eager"
          decoding="async"
          width={known?.width}
          height={known?.height}
          style={aspect}
          onClick={workspaceSrc ? openWorkspace : undefined}
          onLoad={(event) => {
            const img = event.currentTarget
            const size = writeCachedChatImageSize(src, {
              width: img.naturalWidth,
              height: img.naturalHeight
            })
            if (displaySrc) writeCachedChatImageSize(displaySrc, size)
            if (absPath) writeCachedChatImageSize(absPath, size)
            setSizeTick((n) => n + 1)
          }}
        />
      ) : (
        <span className="chat-image-slot" style={aspect} aria-hidden />
      )}
      {canExport && displaySrc ? (
        <span className="chat-image-actions" role="group" aria-label="图片操作">
          <button
            type="button"
            className={`message-actions-btn${copied ? ' message-actions-btn--copied' : ''}`}
            title={copied ? '已复制' : '复制图片'}
            aria-label={copied ? '已复制' : '复制图片'}
            onClick={() => void copy()}
          >
            {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
          </button>
          <button
            type="button"
            className="message-actions-btn"
            title="保存图片"
            aria-label="保存图片"
            onClick={() => void save()}
          >
            <Download size={16} aria-hidden />
          </button>
        </span>
      ) : null}
    </span>
  )
}
