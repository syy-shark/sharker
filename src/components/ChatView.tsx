/**
 * 聊天主视图：消息列表、流式展示、排队气泡与输入区
 * @see src/README.md
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { MarkdownBody } from './MarkdownBody'
import type { AssistantMeta, ChatMessage, ProviderConfig, TurnSegment, WorkspaceItem } from '../../shared/types'
import { resolveContextLimit } from '../../shared/context-limit'
import { sortWorkspaces } from '../../shared/workspace'
import type { QueuedPrompt, PromptSubmitMode } from '../types/chat'
import { AssistantMessage } from './AssistantMessage'
import { MessageActions } from './MessageActions'
import { ContextRing } from './ContextRing'
import { ModelPicker } from './ModelPicker'
import { WorkspacePicker } from './WorkspacePicker'
import { SlashCommandMenu, shouldShowSlashMenu } from './SlashCommandMenu'
import type { SlashCommandMeta } from '../../shared/slash-commands'
import { filterSlashCommands } from '../../shared/slash-commands'
import './ChatView.css'

const STICKY_BOTTOM_PX = 80

/** ChatView Props：工作区/模型选择、消息与流式状态、发送回调 */
interface Props {
  workspaces: WorkspaceItem[]
  activeWorkspaceId: string
  onSelectWorkspace: (id: string) => void
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
  onSend: (text: string, mode?: PromptSubmitMode) => void
  onCancelQueued: (id: string) => void
  onAbort: () => void
  onSlashAction?: (cmd: SlashCommandMeta, args: string) => void
  showHistoryPicker?: boolean
  onCloseHistoryPicker?: () => void
  conversationTitles?: Array<{ id: string; title: string }>
  onPickConversation?: (id: string) => void
}

/** 消息区 + 底部输入框（工作区/模型选择、上下文环、发送/停止/插队） */
export function ChatView({
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
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
  onPickConversation
}: Props) {
  const [input, setInput] = useState('')
  const [slashIndex, setSlashIndex] = useState(0)
  const [stickToBottom, setStickToBottom] = useState(true)
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [contextRingOpen, setContextRingOpen] = useState(false)
  const messagesRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  /** 程序触发的滚动期间，忽略 scroll 事件对 stickToBottom 的干扰 */
  const programmaticScrollRef = useRef(false)
  const stickToBottomRef = useRef(stickToBottom)
  stickToBottomRef.current = stickToBottom
  const isEmpty =
    messages.length === 0 &&
    queuedPrompts.length === 0 &&
    liveSegments.length === 0 &&
    !streaming &&
    !turnThinking &&
    !loading
  const canSend = Boolean(input.trim())
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

  /** 是否贴近底部（用于决定是否自动跟随流式） */
  const checkStickToBottom = useCallback(() => {
    const el = messagesRef.current
    if (!el) return true
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    return distance < STICKY_BOTTOM_PX
  }, [])

  /** 滚动到底部：流式贴底用即时 scrollTop，离散事件才用 smooth */
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = messagesRef.current
    if (!el) return
    programmaticScrollRef.current = true
    el.scrollTo({ top: el.scrollHeight, behavior })
    if (behavior === 'auto') {
      programmaticScrollRef.current = false
      setStickToBottom(checkStickToBottom())
      return
    }
    const finish = () => {
      programmaticScrollRef.current = false
      setStickToBottom(checkStickToBottom())
    }
    el.addEventListener('scroll', finish, { passive: true, once: true })
    window.setTimeout(finish, 500)
  }, [checkStickToBottom])

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
      if (programmaticScrollRef.current) return
      setStickToBottom(checkStickToBottom())
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [checkStickToBottom])

  /** 流式输出：每帧贴底一次，避免 smooth 动画与内容增高来回「荡」 */
  useEffect(() => {
    if (isEmpty || !loading) return
    let rafId = 0
    const follow = () => {
      if (stickToBottomRef.current) {
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

  /** 提交输入：空闲直接发送，忙时默认排队 */
  const submit = (mode: PromptSubmitMode = loading ? 'queue' : 'send') => {
    const t = input.trim()
    if (!t) return
    setInput('')
    setSlashIndex(0)
    setStickToBottom(true)
    onSend(t, mode)
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
    <div className="composer-box">
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
        placeholder={loading ? '可继续输入，Enter 排队… 输入 / 命令' : '输入消息… 输入 / 查看命令'}
        rows={1}
      />
      <div className="composer-footer">
        <div className="composer-footer-left">
          <WorkspacePicker
            workspaces={workspaces}
            activeWorkspaceId={activeWorkspaceId}
            onSelect={onSelectWorkspace}
          />
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
          {loading ? (
            <button
              type="button"
              className="composer-send composer-send--stop"
              onClick={onAbort}
              title="停止"
              aria-label="停止"
            >
              <span className="composer-send-stop" />
            </button>
          ) : (
            <button
              type="button"
              className={`composer-send ${canSend ? 'composer-send--active' : ''}`}
              onClick={() => submit('send')}
              disabled={!canSend}
              title="发送 (Enter)"
              aria-label="发送"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="M8 12V4M8 4L4.5 7.5M8 4l3.5 3.5"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
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
          {messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className="message-row message-row--user">
                <div className="message-user-wrap">
                  <div className="message-bubble message-bubble--user">
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
                turnThinking={turnThinking}
                isThinkingLive={isThinkingLive}
                activeTool={activeTool}
                liveStartedAt={turnStartedAt ?? undefined}
                isStreaming
              />
            </div>
          )}

          {queuedPrompts.map((q) => (
            <div key={q.id} className="message-row message-row--user message-row--queued">
              <div className="message-user-wrap">
                <div className="message-bubble message-bubble--user message-bubble--queued">
                  <span className="queued-badge">排队中</span>
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
                onClick={() => scrollToBottom('smooth')}
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
          <h2 className="chat-empty-prompt" title={activeWorkspace.path}>
            我们应该在
            <span className="chat-empty-name">{activeWorkspace.label}</span>
            中构建什么？
          </h2>
        )}
        <div className="composer-wrap">{composer}</div>
      </div>
    </div>
  )
}
