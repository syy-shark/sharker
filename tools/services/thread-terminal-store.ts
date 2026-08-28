/**
 * 集成终端输出尾（按对话）。主进程 PTY 写入，read_thread_terminal 读取。
 * @see tools/services/ARCH.md
 */
import { appendTerminalBuffer } from '../../shared/terminal-snapshot'

export type ThreadTerminalRecord = {
  id: string
  conversationId: string
  cwd: string
  title: string
  active: boolean
  buffer: string
}

const records = new Map<string, ThreadTerminalRecord>()

function setActiveInThread(conversationId: string, id: string): void {
  for (const record of records.values()) {
    if (record.conversationId === conversationId) {
      record.active = record.id === id
    }
  }
}

export function upsertThreadTerminal(record: ThreadTerminalRecord): void {
  records.set(record.id, record)
  if (record.active) setActiveInThread(record.conversationId, record.id)
}

export function appendThreadTerminalOutput(id: string, chunk: string): void {
  const record = records.get(id)
  if (!record) return
  record.buffer = appendTerminalBuffer(record.buffer, chunk)
}

export function bindThreadTerminal(id: string, conversationId: string): void {
  const record = records.get(id)
  const thread = conversationId.trim()
  if (!record || !thread) return
  record.conversationId = thread
}

export function activateThreadTerminal(id: string): void {
  const record = records.get(id)
  if (!record) return
  setActiveInThread(record.conversationId, id)
}

export function removeThreadTerminal(id: string): void {
  records.delete(id)
}

export function readThreadTerminal(conversationId: string): {
  attached: boolean
  cwd?: string
  tabs: Array<{ title: string; active: boolean }>
  output?: string
} {
  const thread = conversationId.trim()
  if (!thread) return { attached: false, tabs: [] }
  const tabs = [...records.values()].filter((s) => s.conversationId === thread)
  if (!tabs.length) return { attached: false, tabs: [] }
  const active = tabs.find((s) => s.active) ?? tabs[tabs.length - 1]
  if (!active) return { attached: false, tabs: [] }
  return {
    attached: true,
    cwd: active.cwd,
    tabs: tabs.map((s) => ({ title: s.title, active: s.id === active.id })),
    output: active.buffer
  }
}

export function clearThreadTerminals(): void {
  records.clear()
}
