/**
 * 子 Agent 编排：spawn、转向、停止、取结果；按父线程归组，不进侧栏。
 * 快照落 ~/.sharker/subagents.json，重启后仍可点开已结束的孩子。
 * @see agent/ARCH.md
 */
import { randomUUID } from 'crypto'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import type { AppSettings, ChatMessage } from '../shared/types'
import type { SubAgentSnapshot } from '../shared/subagent'
import {
  capSubAgentSnapshot,
  interruptRunningSubAgent,
  parsePersistedSubAgents
} from '../shared/subagent'
import { buildSystemPrompt } from './loop'
import { queryLoop } from './query-loop'
import type { ApprovalHandler, UserInputHandler } from './loop'
import { getParentApprovalHandler, getParentUserInputHandler } from './approval-bridge'
import type { ChatCompletionMessage } from '../providers/openai'
import { createPlaceholderTask, updateTask } from '../tools/services/task-manager'

export interface SubAgentSession {
  id: string
  taskId: string
  parentConversationId: string
  prompt: string
  status: 'running' | 'done' | 'failed'
  result: string
  streaming: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
  generation: number
  abort: AbortController
}

const sessions = new Map<string, SubAgentSession>()

type SubAgentListener = (snapshot: SubAgentSnapshot) => void
let listener: SubAgentListener | null = null
let emitTimer: ReturnType<typeof setTimeout> | null = null
const pendingEmit = new Set<string>()
let persistReady = false
let persistFile: string | null = null
let persistTimer: ReturnType<typeof setTimeout> | null = null

function defaultPersistPath(): string {
  return path.join(os.homedir(), '.sharker', 'subagents.json')
}

function sessionFromSnapshot(snap: SubAgentSnapshot): SubAgentSession {
  return {
    id: snap.id,
    taskId: `restored-${snap.id}`,
    parentConversationId: snap.parentConversationId,
    prompt: snap.prompt,
    status: snap.status,
    result: snap.result,
    streaming: snap.streaming,
    messages: [],
    createdAt: snap.createdAt,
    updatedAt: snap.updatedAt,
    generation: 1,
    abort: new AbortController()
  }
}

async function flushPersist(): Promise<void> {
  if (!persistReady || !persistFile) return
  const payload = {
    sessions: listSubAgents().map((s) => capSubAgentSnapshot(toSubAgentSnapshot(s)))
  }
  await fs.mkdir(path.dirname(persistFile), { recursive: true })
  await fs.writeFile(persistFile, JSON.stringify(payload, null, 2), 'utf8')
}

function schedulePersist(immediate = false): void {
  if (!persistReady) return
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  if (immediate) {
    void flushPersist().catch((e) => console.warn('[subagents] persist failed', e))
    return
  }
  persistTimer = setTimeout(() => {
    persistTimer = null
    void flushPersist().catch((e) => console.warn('[subagents] persist failed', e))
  }, 400)
}

/** 启动时从磁盘恢复；进行中的孩子标为重启中断 */
export async function hydrateSubAgents(filePath?: string): Promise<number> {
  persistFile = filePath || defaultPersistPath()
  persistReady = true
  let raw: unknown = { sessions: [] }
  try {
    raw = JSON.parse(await fs.readFile(persistFile, 'utf8')) as unknown
  } catch {
    raw = { sessions: [] }
  }
  const loaded = parsePersistedSubAgents(raw)
  let interrupted = 0
  for (const row of loaded) {
    if (sessions.has(row.id)) continue
    const snap = interruptRunningSubAgent(row)
    if (snap.status !== row.status) interrupted += 1
    sessions.set(snap.id, sessionFromSnapshot(snap))
  }
  if (interrupted > 0) schedulePersist(true)
  return loaded.length
}

export function setSubAgentListener(fn: SubAgentListener | null): void {
  listener = fn
}

export function toSubAgentSnapshot(session: SubAgentSession): SubAgentSnapshot {
  return {
    id: session.id,
    parentConversationId: session.parentConversationId,
    prompt: session.prompt,
    status: session.status,
    result: session.result,
    streaming: session.streaming,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt
  }
}

function emit(session: SubAgentSnapshot, immediate = false): void {
  schedulePersist(immediate)
  if (!listener) return
  if (immediate) {
    listener(session)
    return
  }
  pendingEmit.add(session.id)
  if (emitTimer) return
  emitTimer = setTimeout(() => {
    emitTimer = null
    for (const id of pendingEmit) {
      const row = sessions.get(id)
      if (row) listener?.(toSubAgentSnapshot(row))
    }
    pendingEmit.clear()
  }, 32)
}

function fallbackApprove(): ReturnType<ApprovalHandler> {
  return Promise.resolve(true)
}

function resolveApproval(explicit?: ApprovalHandler): ApprovalHandler {
  return explicit ?? getParentApprovalHandler() ?? fallbackApprove
}

function combineSignals(parent?: AbortSignal, local?: AbortSignal): AbortSignal {
  const ctrl = new AbortController()
  const onAbort = () => ctrl.abort()
  if (parent?.aborted || local?.aborted) {
    ctrl.abort()
    return ctrl.signal
  }
  parent?.addEventListener('abort', onAbort)
  local?.addEventListener('abort', onAbort)
  return ctrl.signal
}

async function runSubAgentLoop(
  session: SubAgentSession,
  settings: AppSettings,
  prompt: string,
  onApproval: ApprovalHandler,
  parentSignal?: AbortSignal
): Promise<void> {
  const generation = session.generation
  const system = await buildSystemPrompt(settings, { includeBootstrap: true })
  const messages: ChatCompletionMessage[] = [
    {
      role: 'system',
      content: `${system}\n\nYou are a sub-agent. Complete this task concisely:\n${prompt}`
    },
    { role: 'user', content: prompt }
  ]
  try {
    let finalText = ''
    const signal = combineSignals(parentSignal, session.abort.signal)
    for await (const chunk of queryLoop(settings, messages, onApproval, signal, {
      userText: prompt,
      history: [],
      maxIterations: 8,
      conversationId: session.parentConversationId || undefined,
      onUserInput: getParentUserInputHandler() ?? undefined
    })) {
      if (session.generation !== generation) return
      if (chunk.type === 'token' && chunk.content) {
        finalText += chunk.content
        session.streaming = finalText
        session.updatedAt = Date.now()
        emit(toSubAgentSnapshot(session))
      }
      if (signal.aborted) break
    }
    if (session.generation !== generation) return
    session.result = finalText.trim() || session.result || '(no output)'
    session.streaming = ''
    session.status = session.abort.signal.aborted ? 'failed' : 'done'
    if (session.abort.signal.aborted && !session.result) session.result = '已停止'
    session.updatedAt = Date.now()
    updateTask(session.taskId, {
      status: session.status === 'done' ? 'done' : 'failed',
      output: session.result
    })
    emit(toSubAgentSnapshot(session), true)
  } catch (e) {
    if (session.generation !== generation) return
    session.status = 'failed'
    session.result = e instanceof Error ? e.message : String(e)
    session.streaming = ''
    session.updatedAt = Date.now()
    updateTask(session.taskId, { status: 'failed', output: session.result })
    emit(toSubAgentSnapshot(session), true)
  }
}

/** 启动子 Agent（独立 queryLoop；审批走父 turn） */
export async function spawnSubAgent(
  settings: AppSettings,
  prompt: string,
  onApproval?: ApprovalHandler,
  signal?: AbortSignal,
  parentConversationId = ''
): Promise<SubAgentSession> {
  const id = randomUUID().slice(0, 8)
  const now = Date.now()
  const task = createPlaceholderTask(`Sub-agent ${id}`, prompt.slice(0, 120))
  const session: SubAgentSession = {
    id,
    taskId: task.id,
    parentConversationId,
    prompt,
    status: 'running',
    result: '',
    streaming: '',
    messages: [],
    createdAt: now,
    updatedAt: now,
    generation: 1,
    abort: new AbortController()
  }
  sessions.set(id, session)
  emit(toSubAgentSnapshot(session), true)
  void runSubAgentLoop(session, settings, prompt, resolveApproval(onApproval), signal)
  return session
}

export function getSubAgent(id: string): SubAgentSession | undefined {
  return sessions.get(id)
}

export function listSubAgents(): SubAgentSession[] {
  return [...sessions.values()]
}

export function listSubAgentSnapshots(parentConversationId?: string): SubAgentSnapshot[] {
  const all = listSubAgents().map(toSubAgentSnapshot)
  if (!parentConversationId) return all
  return all.filter((s) => s.parentConversationId === parentConversationId)
}

/** 停止正在跑的子 Agent */
export function stopSubAgent(id: string): boolean {
  const session = sessions.get(id)
  if (!session) return false
  if (session.status !== 'running') return true
  session.abort.abort()
  session.status = 'failed'
  session.result = session.result || '已停止'
  session.streaming = ''
  session.updatedAt = Date.now()
  session.generation += 1
  updateTask(session.taskId, { status: 'failed', output: session.result })
  emit(toSubAgentSnapshot(session), true)
  return true
}

/** 向子 Agent 追加 follow-up（同 id 再跑一轮，对标 steer） */
export async function sendSubAgentMessage(
  settings: AppSettings,
  agentId: string,
  message: string,
  onApproval?: ApprovalHandler,
  signal?: AbortSignal
): Promise<string> {
  const prev = sessions.get(agentId)
  if (!prev) {
    const session = await spawnSubAgent(settings, message, onApproval, signal, '')
    return `New sub-agent ${session.id} started for follow-up.`
  }
  if (prev.status === 'running') prev.abort.abort()
  prev.generation += 1
  prev.abort = new AbortController()
  prev.status = 'running'
  prev.prompt = `${prev.prompt}\n\nFollow-up: ${message}`
  prev.streaming = ''
  prev.updatedAt = Date.now()
  emit(toSubAgentSnapshot(prev), true)
  void runSubAgentLoop(prev, settings, prev.prompt, resolveApproval(onApproval), signal)
  return `Sub-agent ${prev.id} steered.`
}

export function resetSubAgentsForTest(): void {
  sessions.clear()
  pendingEmit.clear()
  if (emitTimer) {
    clearTimeout(emitTimer)
    emitTimer = null
  }
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  persistReady = false
  persistFile = null
  listener = null
}
