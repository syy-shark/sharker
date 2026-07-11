/**
 * 聊天主视图：消息列表、流式展示、排队气泡与输入区
 * @see src/README.md
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUp, Clock3, FolderKanban, GitPullRequestArrow, Sparkles } from 'lucide-react'
import { MarkdownBody } from './MarkdownBody'
import type {
  AssistantMeta,
  ApprovalRequest,
  ChatAttachment,
  ChatMessage,
  ProviderConfig,
  TurnSegment,
  WorkspaceItem
} from '../../shared/types'
import { resolveContextLimit } from '../../shared/context-limit'
import { sortWorkspaces } from '../../shared/workspace'
import type { QueuedPrompt, PromptSubmitMode } from '../types/chat'
import { AssistantMessage } from './AssistantMessage'
import { MessageActions } from './MessageActions'
import { ContextRing } from './ContextRing'
import { ModelPicker } from './ModelPicker'
import { SlashCommandMenu, shouldShowSlashMenu } from './SlashCommandMenu'
import type { SlashCommandMeta } from '../../shared/slash-commands'
import { filterSlashCommands } from '../../shared/slash-commands'
import './ChatView.css'

const STICKY_BOTTOM_PX = 80

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}

function AttachmentImage({ attachment }: { attachment: ChatAttachment }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let cancelled = false
    window.sharker
      .readAttachmentDataUrl(attachment.path)
      .then((dataUrl) => {
        if (!cancelled) setSrc(dataUrl)
      })
      .catch(() => {
        if (!cancelled) setSrc('')
      })
    return () => {
      cancelled = true
    }
  }, [attachment.path])

  if (!src) return <div className="attachment-image-placeholder" aria-hidden />
  return <img src={src} alt={attachment.name} />
}

function MessageAttachments({ attachments }: { attachments?: ChatAttachment[] }) {
  if (!attachments?.length) return null
  return (
    <div className="message-attachments">
      {attachments.map((a) => (
        <figure key={a.id} className="message-attachment">
          <AttachmentImage attachment={a} />
          <figcaption>{a.name}</figcaption>
        </figure>
      ))}
    </div>
  )
}

/** ChatView Props：工作区/模型选择、消息与流式状态、发送回调 */
interface Props {
  workspaces: WorkspaceItem[]
  activeWorkspaceId: string
  providers: ProviderConfig[]
  activeProviderId: string
  onSelectProvider: (id: string) => void
  messages: ChatMessage[]
  queuedPrompts: QueuedPrompt[]
  liveSegments: TurnSegment[]
  streaming: string
  turnThinking: string
  loading: boolean
  activeTool: string | null
  liveTurnMeta: AssistantMeta | null
  turnStartedAt: number | null
  turnHadThinking: boolean
  onSend: (text: string, mode?: PromptSubmitMode, attachments?: ChatAttachment[]) => void
  onCancelQueued: (id: string) => void
  onAbort: () => void
  onSlashAction?: (cmd: SlashCommandMeta, args: string) => void
  showHistoryPicker?: boolean
  onCloseHistoryPicker?: () => void
  conversationTitles?: Array<{ id: string; title: string }>
  onPickConversation?: (id: string) => void
  onRetry?: (userMessageId: string) => void
  approval?: ApprovalRequest | null
  approvalResponding?: boolean
  onApproval?: (approved: boolean) => void | Promise<void>
}

/** 消息区 + 底部输入框（工作区/模型选择、上下文环、发送/停止/插队） */
export function ChatView({
  workspaces,
  activeWorkspaceId,
  providers,
  activeProviderId,
  onSelectProvider,
  messages,
  queuedPrompts,
  liveSegments,
  streaming,
  turnThinking,
  loading,
  activeTool,
  liveTurnMeta,
  turnStartedAt,
  turnHadThinking,
  onSend,
  onCancelQueued,
  onAbort,
  onSlashAction,
  showHistoryPicker,
  onCloseHistoryPicker,
  conversationTitles,
  onPickConversation,
  onRetry,
  approval,
  approvalResponding,
  onApproval
}: Props) {
  const [input, setInput] = useState('')
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([])
  const [attachmentError, setAttachmentError] = useState('')
  const [slashIndex, setSlashIndex] = useState(0)
  const [stickToBottom, setStickToBottom] = useState(true)
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [contextRingOpen, setContextRingOpen] = useState(false)
  const [composerFocus, setComposerFocus] = useState<'none' | 'pointer' | 'keyboard'>('none')
  const messagesRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const composerFocusOriginRef = useRef<'pointer' | 'keyboard'>('pointer')
  /** 程序触发的滚动期间，忽略 scroll 事件对 stickToBottom 的干扰 */
  const programmaticScrollRef = useRef(false)
  /** 用户正在回看历史；只有显式点击“回到底部”才解除。 */
  const userScrollLockRef = useRef(false)
  const touchStartYRef = useRef<number | null>(null)
  const shownApprovalIdRef = useRef<string | null>(null)
  const stickToBottomRef = useRef(stickToBottom)
  stickToBottomRef.current = stickToBottom
  const isEmpty =
    messages.length === 0 &&
    queuedPrompts.length === 0 &&
    liveSegments.length === 0 &&
    !streaming &&
    !turnThinking &&
    !loading
  const canSend = Boolean(input.trim() || pendingAttachments.length > 0)
  const slashMenu = shouldShowSlashMenu(input)
  const filteredSlash = slashMenu.show ? filterSlashCommands(slashMenu.query) : []
  const activeWorkspace =
    sortWorkspaces(workspaces ?? []).find((w) => w.id === activeWorkspaceId) ??
    sortWorkspaces(workspaces ?? [])[0]
  const hasWorkspace = Boolean(activeWorkspace?.path?.trim())
  const activeProvider = providers.find((p) => p.id === activeProviderId)
  const modelLabel = activeProvider?.model?.trim() || activeProvider?.name
  const contextLimit = resolveContextLimit(
    activeProvider?.model ?? '',
    activeProvider?.contextWindow
  )

  useEffect(() => {
    const onPointerDown = () => {
      composerFocusOriginRef.current = 'pointer'
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') composerFocusOriginRef.current = 'keyboard'
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [])

  /** 是否贴近底部（用于决定是否自动跟随流式） */
  const checkStickToBottom = useCallback(() => {
    const el = messagesRef.current
    if (!el) return true
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    return distance < STICKY_BOTTOM_PX
  }, [])

  const lockUserScroll = useCallback(() => {
    userScrollLockRef.current = true
    stickToBottomRef.current = false
    setStickToBottom(false)
  }, [])

  /** 滚动到底部：流式贴底用即时 scrollTop，离散事件才用 smooth */
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = messagesRef.current
    if (!el) return
    programmaticScrollRef.current = true
    el.scrollTo({ top: el.scrollHeight, behavior })
    if (behavior === 'auto') {
      programmaticScrollRef.current = false
      if (userScrollLockRef.current) {
        stickToBottomRef.current = false
        setStickToBottom(false)
      } else {
        const nextStickToBottom = checkStickToBottom()
        stickToBottomRef.current = nextStickToBottom
        setStickToBottom(nextStickToBottom)
      }
      return
    }
    const finish = () => {
      programmaticScrollRef.current = false
      if (userScrollLockRef.current) {
        stickToBottomRef.current = false
        setStickToBottom(false)
        return
      }
      const nextStickToBottom = checkStickToBottom()
      stickToBottomRef.current = nextStickToBottom
      setStickToBottom(nextStickToBottom)
    }
    // Keep the programmatic guard for the whole smooth-scroll window. Releasing it
    // on the first scroll event races with the remaining animation frames.
    window.setTimeout(finish, 500)
  }, [checkStickToBottom])

  const resumeStickToBottom = useCallback(() => {
    userScrollLockRef.current = false
    stickToBottomRef.current = true
    setStickToBottom(true)
    scrollToBottom('smooth')
  }, [scrollToBottom])

  /** 根据内容自动调整输入框高度（最高 200px） */
  const syncTextareaHeight = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }

  useEffect(() => {
    const el = messagesRef.current
    if (!el) return
    const onScroll = () => {
      if (userScrollLockRef.current) {
        stickToBottomRef.current = false
        setStickToBottom(false)
        return
      }
      if (programmaticScrollRef.current) return
      const nextStickToBottom = checkStickToBottom()
      if (!nextStickToBottom) {
        userScrollLockRef.current = true
        stickToBottomRef.current = false
        setStickToBottom(false)
        return
      }
      stickToBottomRef.current = true
      setStickToBottom(true)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [checkStickToBottom])

  useEffect(() => {
    const el = messagesRef.current
    if (!el) return

    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) lockUserScroll()
    }
    const onTouchStart = (event: TouchEvent) => {
      touchStartYRef.current = event.touches[0]?.clientY ?? null
    }
    const onTouchMove = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY
      if (y != null && touchStartYRef.current != null && y > touchStartYRef.current) {
        lockUserScroll()
      }
      if (y != null) touchStartYRef.current = y
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'PageUp' || event.key === 'Home') lockUserScroll()
    }

    el.addEventListener('wheel', onWheel, { passive: true, capture: true })
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      el.removeEventListener('wheel', onWheel, true)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [lockUserScroll])

  useEffect(() => {
    if (!approval || shownApprovalIdRef.current === approval.id) return
    shownApprovalIdRef.current = approval.id
    const frame = window.requestAnimationFrame(() => {
      const el = messagesRef.current
      if (!el) return
      programmaticScrollRef.current = true
      el.scrollTop = el.scrollHeight
      programmaticScrollRef.current = false
      lockUserScroll()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [approval, lockUserScroll])

  /** 流式输出：每帧贴底一次，避免 smooth 动画与内容增高来回「荡」 */
  useEffect(() => {
    if (isEmpty || !loading) return
    let rafId = 0
    const follow = () => {
      if (stickToBottomRef.current && !userScrollLockRef.current) {
        const el = messagesRef.current
        if (el) {
          programmaticScrollRef.current = true
          el.scrollTop = el.scrollHeight
          programmaticScrollRef.current = false
        }
      }
      rafId = requestAnimationFrame(follow)
    }
    rafId = requestAnimationFrame(follow)
    return () => cancelAnimationFrame(rafId)
  }, [loading, isEmpty])

  useEffect(() => {
    if (isEmpty || !stickToBottom || loading) return
    scrollToBottom('smooth')
  }, [messages, isEmpty, stickToBottom, loading, scrollToBottom])

  useEffect(() => {
    syncTextareaHeight()
  }, [input])

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!loading) {
      requestAnimationFrame(() => textareaRef.current?.focus())
    }
  }, [loading])

  const addImageFiles = async (files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith('image/'))
    if (!imageFiles.length) return
    setAttachmentError('')
    try {
      const saved = await Promise.all(
        imageFiles.map(async (file) =>
          window.sharker.saveAttachment({
            name: file.name || 'clipboard-image.png',
            mimeType: file.type || 'image/png',
            dataUrl: await readFileAsDataUrl(file)
          })
        )
      )
      setPendingAttachments((prev) => [...prev, ...saved])
    } catch (e) {
      setAttachmentError(e instanceof Error ? e.message : String(e))
    }
  }

  /** 提交输入：空闲直接发送，忙时默认排队 */
  const submit = (mode: PromptSubmitMode = loading ? 'queue' : 'send') => {
    const t = input.trim()
    const attachments = pendingAttachments
    if (!t && attachments.length === 0) return
    setInput('')
    setPendingAttachments([])
    setAttachmentError('')
    setSlashIndex(0)
    setStickToBottom(true)
    onSend(t || '请看这张图片。', mode, attachments)
    requestAnimationFrame(() => {
      syncTextareaHeight()
      textareaRef.current?.focus()
    })
  }

  const pickSlashCommand = (cmd: SlashCommandMeta) => {
    if (cmd.scope === 'ui' && onSlashAction) {
      setInput('')
      setSlashIndex(0)
      onSlashAction(cmd, '')
      requestAnimationFrame(() => textareaRef.current?.focus())
      return
    }
    setInput(`/${cmd.name} `)
    setSlashIndex(0)
    requestAnimationFrame(() => {
      syncTextareaHeight()
      textareaRef.current?.focus()
    })
  }

  /** 输入框与底部工具栏（工作区、模型、上下文、发送） */
  const composer = (
    <div
      className={`composer-box composer-box--focus-${composerFocus}`}
      onFocusCapture={() => setComposerFocus(composerFocusOriginRef.current)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setComposerFocus('none')
        }
      }}
    >
      {(slashMenu.show && filteredSlash.length > 0) ||
      (showHistoryPicker && conversationTitles?.length) ? (
        <div className="composer-popover-slot">
          {slashMenu.show && filteredSlash.length > 0 ? (
            <SlashCommandMenu
              query={slashMenu.query}
              activeIndex={slashIndex}
              onSelect={pickSlashCommand}
              onActiveIndexChange={setSlashIndex}
            />
          ) : null}
          {showHistoryPicker && conversationTitles?.length ? (
            <div className="slash-menu history-picker" role="listbox" aria-label="历史对话">
              <ul className="slash-menu-list">
                {conversationTitles.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="slash-menu-item"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        onPickConversation?.(c.id)
                        onCloseHistoryPicker?.()
                      }}
                    >
                      <span className="slash-menu-desc">{c.title || '未命名对话'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      <textarea
        ref={textareaRef}
        className="composer-input"
        value={input}
        onChange={(e) => {
          setInput(e.target.value)
          setSlashIndex(0)
        }}
        onKeyDown={(e) => {
          if (slashMenu.show && filteredSlash.length > 0) {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setSlashIndex((i) => (i + 1) % filteredSlash.length)
              return
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSlashIndex((i) => (i - 1 + filteredSlash.length) % filteredSlash.length)
              return
            }
            if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
              e.preventDefault()
              const cmd = filteredSlash[slashIndex]
              if (cmd) pickSlashCommand(cmd)
              return
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              setInput('')
              return
            }
          }
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            submit(loading ? 'queue' : 'send')
          }
        }}
        onPaste={(e) => {
          const files = Array.from(e.clipboardData.files)
          if (files.some((f) => f.type.startsWith('image/'))) {
            e.preventDefault()
            void addImageFiles(files)
          }
        }}
        onDrop={(e) => {
          const files = Array.from(e.dataTransfer.files)
          if (files.some((f) => f.type.startsWith('image/'))) {
            e.preventDefault()
            void addImageFiles(files)
          }
        }}
        onDragOver={(e) => {
          if (Array.from(e.dataTransfer.items).some((i) => i.type.startsWith('image/'))) {
            e.preventDefault()
          }
        }}
        placeholder={loading ? '可继续输入，Enter 排队… 输入 / 命令' : '输入消息… 输入 / 查看命令'}
        rows={1}
      />
      {pendingAttachments.length > 0 || attachmentError ? (
        <div className="composer-attachments">
          {pendingAttachments.map((a) => (
            <div key={a.id} className="composer-attachment">
              <AttachmentImage attachment={a} />
              <span title={a.name}>{a.name}</span>
              <button
                type="button"
                onClick={() =>
                  setPendingAttachments((prev) => prev.filter((x) => x.id !== a.id))
                }
                aria-label={`移除 ${a.name}`}
              >
                ×
              </button>
            </div>
          ))}
          {attachmentError ? (
            <span className="composer-attachment-error">{attachmentError}</span>
          ) : null}
        </div>
      ) : null}
      <div className="composer-footer">
        <div className="composer-footer-left">
          <span className="composer-workspace-label" title={activeWorkspace?.path}>
            <FolderKanban size={14} aria-hidden />
            {activeWorkspace?.label ?? '未选择工作区'}
          </span>
        </div>
        <div className="composer-footer-right">
          <ModelPicker
            providers={providers}
            activeProviderId={activeProviderId}
            onSelect={onSelectProvider}
            dismissWhenPeerOpen={contextRingOpen}
            onOpenChange={setModelPickerOpen}
          />
          <ContextRing
            messages={messages}
            streaming={streaming}
            draftInput={input}
            context={contextLimit}
            dismissWhenPeerOpen={modelPickerOpen}
            onOpenChange={setContextRingOpen}
          />
          {loading && canSend ? (
            <button
              type="button"
              className="composer-jump"
              onClick={() => submit('jump')}
              title="插队：中止当前任务并立即执行本条"
              aria-label="插队执行"
            >
              插队
            </button>
          ) : null}
          <span className="composer-send-slot" data-mode={loading ? 'stop' : 'send'}>
            <button
              type="button"
              className={`composer-send composer-send--stop ${loading ? 'composer-send--visible' : ''}`}
              onClick={onAbort}
              title="停止"
              aria-label="停止"
              aria-hidden={!loading}
              tabIndex={loading ? 0 : -1}
            >
              <span className="composer-send-stop" />
            </button>
            <button
              type="button"
              className={`composer-send composer-send--submit ${canSend ? 'composer-send--active' : ''} ${!loading ? 'composer-send--visible' : ''}`}
              onClick={() => submit('send')}
              disabled={!canSend || loading}
              title="发送 (Enter)"
              aria-label="发送"
              aria-hidden={loading}
              tabIndex={loading ? -1 : 0}
            >
              <ArrowUp size={16} aria-hidden />
            </button>
          </span>
        </div>
      </div>
    </div>
  )

  const showLiveAssistant = loading
  const isThinkingLive =
    loading && !streaming.trim() && Boolean(turnThinking.trim()) && liveSegments.length === 0

  return (
    <div className={`chat ${isEmpty ? 'chat--empty' : 'chat--active'}`}>
      {!isEmpty && (
        <div className="messages" ref={messagesRef}>
          {messages.map((m, index) =>
            m.role === 'user' ? (
              <div key={m.id} className="message-row message-row--user">
	                <div className="message-user-wrap">
	                  <div className="message-bubble message-bubble--user">
	                    <MessageAttachments attachments={m.attachments} />
	                    <p>{m.content}</p>
	                  </div>
                  <MessageActions content={m.content} messageId={m.id} />
                </div>
              </div>
            ) : (
              <div key={m.id} className="message-row message-row--assistant">
                <AssistantMessage
                  messageId={m.id}
                  content={m.content}
                  meta={m.meta}
                  modelLabel={m.meta?.model ?? modelLabel}
                  onRetry={
                    index === messages.length - 1 && m.meta?.retryOfUserMessageId && onRetry
                      ? () => onRetry(m.meta!.retryOfUserMessageId!)
                      : undefined
                  }
                />
              </div>
            )
          )}

          {showLiveAssistant && (
            <div className="message-row message-row--assistant message-row--live">
              <AssistantMessage
                messageId="streaming"
                content={streaming}
                meta={liveTurnMeta ?? undefined}
                liveSegments={liveSegments}
                modelLabel={modelLabel}
                hadThinkingLive={turnHadThinking}
                isThinkingLive={isThinkingLive}
                activeTool={activeTool}
                liveStartedAt={turnStartedAt ?? undefined}
                isStreaming
                approval={approval}
                approvalResponding={approvalResponding}
                onApproval={onApproval}
              />
            </div>
          )}

          {queuedPrompts.map((q) => (
            <div key={q.id} className="message-row message-row--user message-row--queued">
              <div className="message-user-wrap">
	                <div className="message-bubble message-bubble--user message-bubble--queued">
	                  <span className="queued-badge">排队中</span>
	                  <MessageAttachments attachments={q.attachments} />
	                  <p>{q.text}</p>
	                </div>
                <button
                  type="button"
                  className="queued-cancel"
                  onClick={() => onCancelQueued(q.id)}
                  title="取消排队"
                  aria-label="取消排队"
                >
                  取消
                </button>
              </div>
            </div>
          ))}
          {!stickToBottom && (
            <div className="chat-scroll-bottom-wrap">
              <button
                type="button"
                className="chat-scroll-bottom"
                onClick={resumeStickToBottom}
                aria-label="回到底部"
              >
                回到底部
              </button>
            </div>
          )} 
          <div ref={bottomRef} />
        </div>
      )}


      <div className="composer-stage">
        {isEmpty && !hasWorkspace && (
          <h2 className="chat-empty-prompt chat-empty-prompt--hint">
            请先在侧栏或设置中添加一个工作区文件夹，然后开始对话。
          </h2>
        )}
        {isEmpty && hasWorkspace && activeWorkspace && (
          <div className="chat-empty-content">
            <div className="chat-empty-heading">
              <span className="chat-empty-kicker"><FolderKanban size={14} aria-hidden /> {activeWorkspace.label}</span>
              <h2 className="chat-empty-prompt" title={activeWorkspace.path}>今天从哪里开始？</h2>
            </div>
            <div className="chat-empty-actions" aria-label="快速开始">
              <button type="button" onClick={() => onSend('请检查当前项目状态，并告诉我最值得先处理的事情。')}>
                <GitPullRequestArrow size={16} aria-hidden />
                <span><strong>查看项目状态</strong><small>检查代码、Git 与待办</small></span>
              </button>
              <button type="button" onClick={() => onSend('请和我一起规划一个新任务，先了解目标和约束，不要立刻修改代码。')}>
                <Sparkles size={16} aria-hidden />
                <span><strong>规划新任务</strong><small>澄清目标并形成方案</small></span>
              </button>
            </div>
            {conversationTitles?.length ? (
              <div className="chat-empty-recent">
                <span><Clock3 size={13} aria-hidden /> 最近对话</span>
                {conversationTitles.slice(-3).reverse().map((conversation) => (
                  <button key={conversation.id} type="button" onClick={() => onPickConversation?.(conversation.id)}>
                    {conversation.title || '未命名对话'}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )}
        <div className="composer-wrap">{composer}</div>
      </div>
    </div>
  )
}
