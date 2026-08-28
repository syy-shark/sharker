import { describe, expect, it } from 'vitest'
import {
  appendTerminalBuffer,
  formatThreadTerminalSnapshot,
  stripAnsi
} from './terminal-snapshot'

describe('terminal snapshot', () => {
  it('strips ansi, rings the buffer, and formats an attached tab', () => {
    expect(stripAnsi('\u001b[32mok\u001b[0m\n')).toBe('ok\n')
    expect(appendTerminalBuffer('abc', 'def', 10)).toBe('abcdef')
    expect(appendTerminalBuffer('keep\nxxxx', 'yyyy', 8)).toBe('xxxxyyyy')

    expect(formatThreadTerminalSnapshot({ attached: false })).toContain('还没有打开集成终端')
    expect(
      formatThreadTerminalSnapshot({
        attached: true,
        cwd: '/tmp/proj',
        tabs: [
          { title: '终端', active: false },
          { title: '终端 2', active: true }
        ],
        output: '\u001b[31mFAIL\u001b[0m compiled'
      })
    ).toContain('当前 终端 2（共 2 个：终端 · 「终端 2」）')
    expect(
      formatThreadTerminalSnapshot({
        attached: true,
        tabs: [{ title: '终端', active: true }],
        output: 'abcdefghij',
        maxChars: 4
      })
    ).toMatch(/ghij$/)
  })
})
