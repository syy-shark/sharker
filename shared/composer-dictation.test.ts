import { describe, expect, it } from 'vitest'
import {
  appendDictationTranscript,
  isDictationShortcut,
  isVoiceChatShortcut,
  textForSpeech
} from './composer-dictation'

describe('composer dictation', () => {
  it('matches Codex Ctrl+Shift+D only', () => {
    expect(
      isDictationShortcut({ key: 'd', ctrlKey: true, shiftKey: true })
    ).toBe(true)
    expect(
      isDictationShortcut({ key: 'D', ctrlKey: true, shiftKey: true })
    ).toBe(true)
    expect(
      isDictationShortcut({ key: 'd', ctrlKey: false, metaKey: true, shiftKey: true })
    ).toBe(false)
    expect(isDictationShortcut({ key: 'd', ctrlKey: true, shiftKey: false })).toBe(false)
    expect(
      isDictationShortcut({ key: 'd', ctrlKey: true, shiftKey: true, isComposing: true })
    ).toBe(false)
  })

  it('appends transcripts with a single space', () => {
    expect(appendDictationTranscript('', '  修好滚动  ')).toBe('修好滚动')
    expect(appendDictationTranscript('请', '继续')).toBe('请 继续')
    expect(appendDictationTranscript('请 ', '继续')).toBe('请 继续')
    expect(appendDictationTranscript('修好', '，然后推送')).toBe('修好，然后推送')
  })

  it('matches Codex Ctrl+Shift+V for voice chat', () => {
    expect(isVoiceChatShortcut({ key: 'v', ctrlKey: true, shiftKey: true })).toBe(true)
    expect(
      isVoiceChatShortcut({ key: 'v', ctrlKey: false, metaKey: true, shiftKey: true })
    ).toBe(false)
  })

  it('strips fences before speech', () => {
    expect(textForSpeech('好的\n```ts\nconst x = 1\n```\n已修好')).toBe('好的 已修好')
  })
})
