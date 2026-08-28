import { describe, expect, it } from 'vitest'
import {
  formatSideChatPrompt,
  normalizeTranscriptSelection,
  shouldOfferSideChat,
  SIDE_CHAT_COMPOSER_SEL,
  SIDE_CHAT_LIVE_ROW_SEL,
  SIDE_CHAT_SELECTION_MAX,
  SIDE_CHAT_TRANSCRIPT_SEL
} from './side-chat-quote'

describe('side chat quote', () => {
  it('normalizes selection and formats a side-chat prompt', () => {
    expect(normalizeTranscriptSelection('  a \n\n\n b  ')).toBe('a\n\n b')
    expect(normalizeTranscriptSelection('   \n')).toBe('')
    const long = 'x'.repeat(SIDE_CHAT_SELECTION_MAX + 40)
    const cut = normalizeTranscriptSelection(long)
    expect(cut.endsWith('\n…')).toBe(true)
    expect(cut.length).toBeLessThan(long.length)
    expect(formatSideChatPrompt('')).toBe('')
    expect(formatSideChatPrompt('  ')).toBe('')
    expect(formatSideChatPrompt('风险在这里', '这段有没有明显漏洞？')).toBe(
      ['这段有没有明显漏洞？', '', '对话摘录：', '', '> 风险在这里'].join('\n')
    )
    expect(formatSideChatPrompt('第一行\n第二行')).toBe(
      [
        '关于这段对话摘录：',
        '',
        '> 第一行',
        '> 第二行',
        '',
        '请说明要点并指出明显风险。先不要改文件。'
      ].join('\n')
    )
  })

  it('accepts transcript ranges and rejects composer or live rows', () => {
    const hits = (match: string | null) => (selector: string) => (match === selector ? {} : null)
    expect(shouldOfferSideChat(hits(SIDE_CHAT_TRANSCRIPT_SEL))).toBe(true)
    expect(shouldOfferSideChat(hits(SIDE_CHAT_LIVE_ROW_SEL))).toBe(false)
    expect(shouldOfferSideChat(hits(SIDE_CHAT_COMPOSER_SEL))).toBe(false)
    expect(shouldOfferSideChat(() => null)).toBe(false)
  })
})
