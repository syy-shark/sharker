import { describe, expect, it } from 'vitest'
import {
  COPY_BLOCKQUOTE_LABEL,
  COPY_CODE_BLOCK_LABEL,
  COPY_FROM_RESPONSE_LABEL,
  COPY_WHOLE_RESPONSE_LABEL,
  copiedToClipboardNote,
  copyCodeTargetLabel,
  copySkipLiveMessageId,
  copyTargetPreview,
  lastCompletedAssistantText,
  listCopyOutputTargets
} from './copy-output'

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
    expect(
      lastCompletedAssistantText([
        { role: 'assistant', content: 'keep', meta: { outcome: 'success' } },
        { role: 'assistant', content: '已复制上一条助手回复。' }
      ])
    ).toBe('keep')
    expect(
      lastCompletedAssistantText(
        [
          { id: 'done', role: 'assistant', content: 'keep', meta: { model: 'kimi' } },
          { id: 'live', role: 'assistant', content: 'partial stream' }
        ],
        { skipMessageId: 'live' }
      )
    ).toBe('keep')
    expect(copySkipLiveMessageId({ liveAssistantId: 'a1', turnInFlight: true })).toBe('a1')
    expect(copySkipLiveMessageId({ liveAssistantId: 'a1', turnInFlight: false })).toBeNull()
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
    expect(targets[0]?.label).toBe(COPY_WHOLE_RESPONSE_LABEL)
    expect(targets[0]?.preview).toBe('Intro')
    expect(targets[1]?.text).toBe('const x = 1')
    expect(targets[1]?.label).toBe(copyCodeTargetLabel('ts'))
    expect(targets[1]?.preview).toBe('const x = 1')
    expect(targets[2]?.text).toBe('plain')
    expect(targets[2]?.label).toBe(COPY_CODE_BLOCK_LABEL)
    expect(targets[2]?.preview).toBe('plain')
    expect(targets[3]?.text).toBe('note')
    expect(targets[3]?.label).toBe(COPY_BLOCKQUOTE_LABEL)
    expect(targets[3]?.preview).toBe('note')
    expect(copyTargetPreview('  first line\nsecond', 5)).toBe('first')
    expect(copiedToClipboardNote('python code')).toBe('Copied python code to clipboard')
    expect(COPY_FROM_RESPONSE_LABEL).toBe('Copy from response')
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
