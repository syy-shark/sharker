import { describe, expect, it } from 'vitest'
import { lastCompletedAssistantText, listCopyOutputTargets } from './copy-output'

describe('copy output', () => {
  it('returns the latest completed assistant text', () => {
    expect(
      lastCompletedAssistantText([
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'one' },
        { role: 'user', content: 'more' },
        { role: 'assistant', content: '  two  ' }
      ])
    ).toBe('two')
  })

  it('skips empty assistant rows', () => {
    expect(
      lastCompletedAssistantText([
        { role: 'assistant', content: 'keep' },
        { role: 'assistant', content: '   ' }
      ])
    ).toBe('keep')
    expect(lastCompletedAssistantText([{ role: 'user', content: 'hi' }])).toBe('')
    const md = 'Intro\n\n```ts\nconst x = 1\n```\n\n> note\n\n```\nplain\n```'
    const targets = listCopyOutputTargets(md)
    expect(targets.map((t) => t.kind)).toEqual(['full', 'code', 'code', 'quote'])
    expect(targets[1]?.text).toBe('const x = 1')
    expect(targets[1]?.label).toBe('代码 · ts')
    expect(targets[2]?.text).toBe('plain')
    expect(targets[3]?.text).toBe('note')
    expect(listCopyOutputTargets('plain only')).toHaveLength(1)
    expect(listCopyOutputTargets('')).toEqual([])
    expect(listCopyOutputTargets('```ts\nconst x = 1\n```\n\n> inside fence stays out')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'code', text: 'const x = 1' }),
        expect.objectContaining({ kind: 'quote', text: 'inside fence stays out' })
      ])
    )
    expect(listCopyOutputTargets('```\n> not a quote\n```').map((t) => t.kind)).toEqual([
      'full',
      'code'
    ])
  })
})
