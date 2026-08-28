import { describe, expect, it } from 'vitest'
import { formatMemoryStatus, parseMemoryCommand } from './memory-command'

describe('memory command', () => {
  it('parses on/off and inject/generate', () => {
    expect(parseMemoryCommand('')).toEqual({ kind: 'status' })
    expect(parseMemoryCommand('on')).toEqual({
      kind: 'set',
      injection: true,
      generation: true
    })
    expect(parseMemoryCommand('off')).toEqual({
      kind: 'set',
      injection: false,
      generation: false
    })
    expect(parseMemoryCommand('inject off')).toEqual({ kind: 'set', injection: false })
    expect(parseMemoryCommand('generate on')).toEqual({ kind: 'set', generation: true })
  })

  it('formats empty and listed memories', () => {
    expect(
      formatMemoryStatus({ injection: true, generation: false, items: [] })
    ).toContain('写入：关')
    const text = formatMemoryStatus({
      injection: true,
      generation: true,
      items: [{ id: '1', scope: 'project', kind: 'fact', content: 'use vitest' }]
    })
    expect(text).toContain('[fact/project]')
    expect(text).toContain('use vitest')
  })
})
