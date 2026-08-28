import { describe, expect, it } from 'vitest'
import {
  activateThreadTerminal,
  appendThreadTerminalOutput,
  bindThreadTerminal,
  clearThreadTerminals,
  readThreadTerminal,
  upsertThreadTerminal
} from './thread-terminal-store'

describe('thread terminal store', () => {
  it('binds a pending session to a chat and reads the active tab', () => {
    clearThreadTerminals()
    upsertThreadTerminal({
      id: 'a',
      conversationId: 'pending:/tmp/p',
      cwd: '/tmp/p',
      title: '终端',
      active: true,
      buffer: ''
    })
    upsertThreadTerminal({
      id: 'b',
      conversationId: 'pending:/tmp/p',
      cwd: '/tmp/p',
      title: '终端 2',
      active: true,
      buffer: ''
    })
    bindThreadTerminal('a', 'chat-1')
    bindThreadTerminal('b', 'chat-1')
    appendThreadTerminalOutput('a', 'one\n')
    appendThreadTerminalOutput('b', 'two\n')
    activateThreadTerminal('b')
    const snap = readThreadTerminal('chat-1')
    expect(snap.attached).toBe(true)
    expect(snap.tabs.map((t) => t.title)).toEqual(['终端', '终端 2'])
    expect(snap.tabs.find((t) => t.active)?.title).toBe('终端 2')
    expect(snap.output).toContain('two')
    expect(readThreadTerminal('missing').attached).toBe(false)
    clearThreadTerminals()
  })
})
