/**
 * 对话渲染图：悬停复制 / 保存；工作区相对路径经 readFileDataUrl 成图。
 * 右键页内菜单：复制/保存；工作区图再打开 / 揭示 / 复制路径（对标 Codex #17591 / #40778）。
 * 点图开视口自适应灯箱（对标 Codex image preview / #26851），不订直播 token、不发明画布或拖出。
 * @see src/components/ARCH.md
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy, Download, X } from 'lucide-react'
import {
  canExportChatImage,
  chatImageAspectStyle,
  chatImageLightboxFit,
  chatImageMenuItems,
  chatImageSlotMinHeight,
  liveChatImageMinHeight,
  isRemoteChatImageSrc,
  isWorkspaceChatImageSrc,
  peekChatImageSizeFromDataUrl,
  readCachedChatImageSize,
  readCachedWorkspaceImageDataUrl,
  resolveWorkspaceChatImagePath,
  writeCachedChatImageSize,
  writeCachedWorkspaceImageDataUrl,
  type ChatImageExportInput
} from '../../shared/chat-image'
import { clampReviewMenuPosition } from '../../shared/review-file-click'
import {
  dispatchCopyWorkspaceFilePath,
  dispatchOpenWorkspaceFile,
  dispatchRevealWorkspaceFile
} from '../lib/open-workspace-file'
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

function readLightboxViewport(): { width: number; height: number } {
  if (typeof window === 'undefined') return { width: 0, height: 0 }
  return {
    width: window.innerWidth,
    height: window.visualViewport?.height ?? window.innerHeight
  }
}

/** 对话渲染图：直播槽占位；点开灯箱不抬 ChatView */
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
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [lightbox, setLightbox] = useState(false)
  const [viewport, setViewport] = useState(readLightboxViewport)
  const dialogRef = useRef<HTMLDivElement>(null)

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
  const peeked =
    displaySrc.startsWith('data:image/') ? peekChatImageSizeFromDataUrl(displaySrc) : null
  if (peeked) {
    writeCachedChatImageSize(src, peeked)
    writeCachedChatImageSize(displaySrc, peeked)
    if (absPath) writeCachedChatImageSize(absPath, peeked)
  }
  const known =
    peeked ??
    readCachedChatImageSize(src) ??
    readCachedChatImageSize(displaySrc) ??
    readCachedChatImageSize(absPath)
  const aspect = chatImageAspectStyle(known)
  const pending = !known && (remote || (workspaceSrc && !failed))
  const slot = chatImageSlotMinHeight(known, pending)
  const slotHighWater = useRef(slot)
  if (slot > slotHighWater.current) slotHighWater.current = slot
  const reserved = liveChatImageMinHeight(slotHighWater.current, known, pending)
  const input: ChatImageExportInput = {
    src: displaySrc || src,
    filePath: resolvedFilePath,
    name,
    alt
  }
  const canExport = canExportChatImage(input)
  const canLightbox = Boolean(displaySrc)

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

  const menuItems = chatImageMenuItems({
    workspace: workspaceSrc,
    canExport,
    canLightbox,
    platform: typeof window !== 'undefined' ? window.sharker?.platform : undefined
  })

  const openWorkspace = () => {
    if (!workspaceSrc) return
    dispatchOpenWorkspaceFile({ path: src })
  }

  const openLightbox = () => {
    if (!displaySrc) return
    setMenu(null)
    setViewport(readLightboxViewport())
    setLightbox(true)
  }

  const closeLightbox = () => setLightbox(false)

  useEffect(() => {
    if (!menu) return
    const onDoc = (event: MouseEvent) => {
      const node = event.target
      if (node instanceof Element && node.closest('[data-chat-image-menu]')) return
      setMenu(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  useEffect(() => {
    if (!lightbox) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      closeLightbox()
    }
    const onResize = () => setViewport(readLightboxViewport())
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', onResize)
    window.visualViewport?.addEventListener('resize', onResize)
    dialogRef.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('resize', onResize)
      window.visualViewport?.removeEventListener('resize', onResize)
    }
  }, [lightbox])

  if (!remote && !workspaceSrc) return null
  if (workspaceSrc && (!absPath || failed)) return null

  const fit = chatImageLightboxFit(known, viewport)

  return (
    <span
      className={`chat-image${pending ? ' chat-image--pending' : ''}${
        workspaceSrc ? ' chat-image--workspace' : ''
      }${canLightbox ? ' chat-image--openable' : ''}`}
      style={reserved ? { minHeight: reserved } : undefined}
      onContextMenu={(event) => {
        if (menuItems.length === 0) return
        event.preventDefault()
        event.stopPropagation()
        const next = clampReviewMenuPosition(
          event.clientX,
          event.clientY,
          { width: 176, height: Math.max(36, menuItems.length * 32 + 12) },
          { width: window.innerWidth, height: window.innerHeight }
        )
        setMenu({ x: next.x, y: next.y })
      }}
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
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey) return
            event.preventDefault()
            event.stopPropagation()
            openLightbox()
          }}
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
      {menu && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="chat-image-menu glass-popover popover-enter"
              role="menu"
              data-chat-image-menu
              style={{ top: menu.y, left: menu.x }}
            >
              {menuItems.map((item) => (
                <button
                  key={item.action}
                  type="button"
                  role="menuitem"
                  className="chat-image-menu-item"
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    if (item.action === 'lightbox') openLightbox()
                    else if (item.action === 'open') openWorkspace()
                    else if (item.action === 'reveal' && workspaceSrc) {
                      dispatchRevealWorkspaceFile(src)
                    } else if (item.action === 'copy-path' && workspaceSrc) {
                      dispatchCopyWorkspaceFilePath(src)
                    } else if (item.action === 'copy-image') void copy()
                    else if (item.action === 'save') void save()
                    setMenu(null)
                  }}
                >
                  {item.title}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
      {lightbox && displaySrc && typeof document !== 'undefined'
        ? createPortal(
            <div className="chat-image-lightbox" role="presentation">
              <button
                type="button"
                className="chat-image-lightbox-backdrop"
                aria-label="关闭图片预览"
                onClick={closeLightbox}
              />
              <div
                ref={dialogRef}
                className="chat-image-lightbox-dialog"
                role="dialog"
                aria-modal="true"
                aria-label={alt?.trim() || '图片预览'}
                tabIndex={-1}
              >
                <img
                  src={displaySrc}
                  alt={alt ?? ''}
                  width={fit.width || known?.width}
                  height={fit.height || known?.height}
                  style={
                    fit.width
                      ? { width: fit.width, height: fit.height }
                      : { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }
                  }
                />
              </div>
              <div className="chat-image-lightbox-toolbar glass-popover" role="toolbar" aria-label="图片预览操作">
                {canExport ? (
                  <>
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
                  </>
                ) : null}
                {workspaceSrc ? (
                  <button
                    type="button"
                    className="chat-image-lightbox-text"
                    onClick={() => {
                      openWorkspace()
                      closeLightbox()
                    }}
                  >
                    打开预览
                  </button>
                ) : null}
                <button
                  type="button"
                  className="message-actions-btn"
                  title="关闭"
                  aria-label="关闭图片预览"
                  onClick={closeLightbox}
                >
                  <X size={16} aria-hidden />
                </button>
              </div>
            </div>,
            document.body
          )
        : null}
    </span>
  )
}
