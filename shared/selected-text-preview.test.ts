import { describe, expect, it } from 'vitest'
import {
  createSelectedTextPreview,
  findFlattenedExcerptRange,
  findSelectedTextSourceMessageId,
  flattenForSelectionMatch,
  formatSelectedTextSubmit,
  messageContainsSelectedText,
  normalizeSelectedTextDraft,
  parseSelectedTextSubmit,
  selectedTextChipLabel,
  selectedTextTitle,
  userFacingSelectedTextRequest
} from './selected-text-preview'

describe('selected-text-preview', () => {
  it('stages official Selection chips and wraps submit as # Selected text:', () => {
    expect(selectedTextTitle(0)).toBe('Selection 1')
    expect(selectedTextTitle(1)).toBe('Selection 2')
    expect(selectedTextChipLabel('short')).toBe('short')
    expect(selectedTextChipLabel('  many   spaces  ')).toBe('many spaces')
    const long = 'word '.repeat(20).trim()
    const chip = selectedTextChipLabel(long, 48)
    expect(chip.endsWith('…')).toBe(true)
    expect(chip.length).toBeLessThanOrEqual(48)
    expect(createSelectedTextPreview('   \n')).toBeNull()
    const one = createSelectedTextPreview('  first line \n\n second  ', 'file', 'sel-fixed')
    expect(one).toEqual({
      id: 'sel-fixed',
      text: 'first line\n\n second',
      source: 'file'
    })
    expect(formatSelectedTextSubmit([], 'just ask')).toBe('just ask')
    expect(
      formatSelectedTextSubmit(
        [
          { id: 'a', text: 'alpha', source: 'transcript' },
          { id: 'b', text: 'beta', source: 'terminal' }
        ],
        'please explain'
      )
    ).toBe(
      [
        '# Selected text:',
        '',
        '## Selection 1',
        'alpha',
        '',
        '## Selection 2',
        'beta',
        '',
        '## My request for Codex:',
        'please explain'
      ].join('\n')
    )
    expect(formatSelectedTextSubmit([{ id: 'a', text: 'only', source: 'file' }], '')).toBe(
      ['# Selected text:', '', '## Selection 1', 'only'].join('\n')
    )
    const nine = Array.from({ length: 9 }, (_, i) => ({
      id: `n${i}`,
      text: `t${i}`,
      source: 'transcript' as const
    }))
    expect(normalizeSelectedTextDraft(nine)).toHaveLength(8)
    expect(normalizeSelectedTextDraft([{ text: '   ' }, null, { text: 'keep', source: 'terminal' }])).toEqual([
      expect.objectContaining({ text: 'keep', source: 'terminal' })
    ])
    expect(normalizeSelectedTextDraft('nope')).toEqual([])
    expect(
      formatSelectedTextSubmit(
        [{ id: 'c', text: 'browser annotations', source: 'transcript', comment: 'not browser annotations' }],
        'check this'
      )
    ).toBe(
      [
        '# Selected text:',
        '',
        '## Selection 1',
        'browser annotations',
        '',
        'Comment: not browser annotations',
        '',
        '## My request for Codex:',
        'check this'
      ].join('\n')
    )
    const submitted = formatSelectedTextSubmit(
      [{ id: 'c', text: 'browser annotations', source: 'transcript', comment: 'not browser annotations' }],
      'check this'
    )
    const parsed = parseSelectedTextSubmit(submitted)
    expect(parsed?.request).toBe('check this')
    expect(parsed?.selections.map((item) => ({ text: item.text, comment: item.comment }))).toEqual([
      { text: 'browser annotations', comment: 'not browser annotations' }
    ])
    expect(userFacingSelectedTextRequest(submitted)).toBe('check this')
    expect(userFacingSelectedTextRequest('plain ask')).toBe('plain ask')
    expect(parseSelectedTextSubmit('plain ask')).toBeNull()
    expect(normalizeSelectedTextDraft([{ text: 'keep', source: 'file', comment: '  note  ' }])).toEqual([
      expect.objectContaining({ text: 'keep', source: 'file', comment: 'note' })
    ])
    expect(
      normalizeSelectedTextDraft([{ text: 'Buy now', source: 'browser', comment: '  wrap  ' }])
    ).toEqual([expect.objectContaining({ text: 'Buy now', source: 'browser', comment: 'wrap' })])
  })

  it('finds the source message for an Add to chat excerpt', () => {
    expect(messageContainsSelectedText('The overflow wraps on mobile.', 'overflow wraps')).toBe(
      true
    )
    expect(messageContainsSelectedText('unrelated', 'overflow wraps')).toBe(false)
    const rows = [
      { id: 'a1', content: 'Earlier note' },
      { id: 's1', content: 'The button overflow wraps on mobile.' },
      {
        id: 'u1',
        content: formatSelectedTextSubmit(
          [{ id: 'sel', text: 'overflow wraps on mobile', source: 'transcript' }],
          'fix that'
        )
      }
    ]
    expect(findSelectedTextSourceMessageId(rows, 'overflow wraps on mobile', 'u1')).toBe('s1')
    expect(findSelectedTextSourceMessageId(rows, 'missing excerpt', 'u1')).toBeNull()
    expect(findSelectedTextSourceMessageId(rows, 'overflow wraps on mobile')).toBe('s1')
  })

  it('maps a flattened excerpt onto visible source offsets', () => {
    expect(flattenForSelectionMatch('  hello\n  world  ')).toBe('hello world')
    expect(findFlattenedExcerptRange('The overflow wraps on mobile.', 'overflow wraps')).toEqual({
      start: 4,
      end: 18
    })
    expect(findFlattenedExcerptRange('hello\n  world extra', 'hello world')).toEqual({
      start: 0,
      end: 13
    })
    expect(findFlattenedExcerptRange('  Foo BAR  ', 'foo bar')).toEqual({ start: 2, end: 9 })
    expect(findFlattenedExcerptRange('unrelated', 'overflow wraps')).toBeNull()
  })
})
