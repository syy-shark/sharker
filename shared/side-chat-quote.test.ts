import { describe, expect, it } from 'vitest'
import {
  ADD_TO_CHAT_LABEL,
  ASK_IN_SIDE_CHAT_LABEL,
  FILE_PREVIEW_SEL,
  formatComposerInsert,
  formatSideChatPrompt,
  mergeComposerInsert,
  normalizeTranscriptSelection,
  placeSelectionAskBar,
  shouldOfferFilePreviewSelection,
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
    expect(formatSideChatPrompt('npm test', '', 'terminal')).toBe(
      [
        '关于这段终端输出：',
        '',
        '> npm test',
        '',
        '请说明要点并指出明显风险。先不要改文件。'
      ].join('\n')
    )
    expect(formatSideChatPrompt('ECONNREFUSED', '为什么连不上？', 'terminal')).toBe(
      ['为什么连不上？', '', '终端输出：', '', '> ECONNREFUSED'].join('\n')
    )
    expect(formatSideChatPrompt('export const x = 1', '', 'file')).toBe(
      [
        '关于这段文件摘录：',
        '',
        '> export const x = 1',
        '',
        '请说明要点并指出明显风险。先不要改文件。'
      ].join('\n')
    )
    expect(formatComposerInsert('第一行\n第二行')).toBe(
      ['对话摘录：', '', '> 第一行', '> 第二行'].join('\n')
    )
    expect(formatComposerInsert('npm test', 'terminal')).toBe(
      ['终端输出：', '', '> npm test'].join('\n')
    )
    expect(formatComposerInsert('  const n = 1  ', 'file')).toBe(
      ['文件摘录：', '', '> const n = 1'].join('\n')
    )
    expect(formatComposerInsert('button.cta', 'browser')).toBe(
      ['浏览器批注：', '', '> button.cta'].join('\n')
    )
    expect(formatSideChatPrompt('Buy now', '按钮溢出', 'browser')).toBe(
      ['按钮溢出', '', '浏览器批注：', '', '> Buy now'].join('\n')
    )
    expect(formatComposerInsert('   \n')).toBe('')
    expect(mergeComposerInsert('', '对话摘录：\n\n> a')).toBe('对话摘录：\n\n> a')
    expect(mergeComposerInsert('请看这里', '对话摘录：\n\n> a')).toBe(
      ['请看这里', '', '对话摘录：', '', '> a'].join('\n')
    )
    expect(mergeComposerInsert('草稿  \n\n', '对话摘录：\n\n> a')).toBe(
      ['草稿', '', '对话摘录：', '', '> a'].join('\n')
    )
    expect(mergeComposerInsert('草稿', '')).toBe('草稿')
    expect(placeSelectionAskBar({ top: 10, bottom: 40, left: 100, width: 80 }, { top: 0, bottom: 400, left: 0, right: 720 })).toEqual({
      top: 48,
      left: 140
    })
    expect(placeSelectionAskBar({ top: 380, bottom: 390, left: 10, width: 20 }, { top: 0, bottom: 400, left: 0, right: 200 })).toEqual({
      top: 364,
      left: 72
    })
  })

  it('accepts transcript and live rows and rejects composer', () => {
    const hits = (match: string | null) => (selector: string) => (match === selector ? {} : null)
    expect(shouldOfferSideChat(hits(SIDE_CHAT_TRANSCRIPT_SEL))).toBe(true)
    expect(shouldOfferSideChat(hits(SIDE_CHAT_LIVE_ROW_SEL))).toBe(true)
    expect(shouldOfferSideChat(hits(SIDE_CHAT_COMPOSER_SEL))).toBe(false)
    expect(shouldOfferSideChat(() => null)).toBe(false)
    expect(FILE_PREVIEW_SEL).toContain('file-md-preview')
    expect(shouldOfferFilePreviewSelection(hits(FILE_PREVIEW_SEL))).toBe(true)
    expect(shouldOfferFilePreviewSelection(hits(SIDE_CHAT_COMPOSER_SEL))).toBe(false)
    expect(shouldOfferFilePreviewSelection(() => null)).toBe(false)
    expect(ADD_TO_CHAT_LABEL).toBe('加入对话')
    expect(ASK_IN_SIDE_CHAT_LABEL).toBe('旁路提问')
  })
})
