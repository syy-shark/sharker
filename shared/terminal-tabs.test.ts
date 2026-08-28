import { describe, expect, it } from 'vitest'
import {
  addTerminalTab,
  closeTerminalTab,
  ensureTerminalTabs,
  MAX_TERMINAL_TABS,
  rememberThreadTerminal,
  threadTerminalKey
} from './terminal-tabs'

describe('terminal tabs', () => {
  it('keeps tabs per thread and refuses to drop the last one', () => {
    expect(threadTerminalKey('chat-1', '/tmp/a')).toBe('chat-1')
    expect(threadTerminalKey('', '/tmp/proj')).toBe('pending:/tmp/proj')
    expect(threadTerminalKey(null, '')).toBe('pending')

    const first = ensureTerminalTabs([])
    expect(first).toEqual([{ id: 't1', title: '终端' }])
    const added = addTerminalTab(first)
    expect(added.tabs.map((tab) => tab.title)).toEqual(['终端', '终端 2'])
    expect(added.activeId).toBe('t2')

    let tabs = first
    for (let i = 0; i < 12; i++) tabs = addTerminalTab(tabs).tabs
    expect(tabs).toHaveLength(MAX_TERMINAL_TABS)
    expect(tabs.at(-1)?.title).toBe('终端 8')

    const closed = closeTerminalTab(tabs, 't8', 't8')
    expect(closed.tabs).toHaveLength(7)
    expect(closed.activeId).toBe('t7')
    expect(closeTerminalTab([{ id: 't1', title: '终端' }], 't1').tabs).toHaveLength(1)

    expect(rememberThreadTerminal(['a', 'b'], 'c')).toEqual(['c', 'a', 'b'])
    expect(rememberThreadTerminal(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c'])
    expect(rememberThreadTerminal(['a', 'b', 'c', 'd'], 'e', 3)).toEqual(['e', 'a', 'b'])
  })
})
