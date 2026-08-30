import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  UNABLE_TO_TRANSCRIBE_AUDIO,
  appendDictationTranscript,
  isDictationHoldKey,
  isDictationShortcut,
  isVoiceChatShortcut,
  textForSpeech
} from './composer-dictation'

describe('composer dictation', () => {
  it('uses official Unable to transcribe audio copy', () => {
    expect(UNABLE_TO_TRANSCRIBE_AUDIO).toBe('Unable to transcribe audio')
  })

  it('matches official Hold Ctrl+M without treating Ctrl+Shift+M as hold', () => {
    expect(isDictationHoldKey({ key: 'm', ctrlKey: true })).toBe(true)
    expect(isDictationHoldKey({ key: 'M', ctrlKey: true })).toBe(true)
    expect(isDictationHoldKey({ key: 'm', ctrlKey: true, shiftKey: true })).toBe(false)
    expect(isDictationHoldKey({ key: 'm', ctrlKey: false, metaKey: true })).toBe(false)
    expect(isDictationHoldKey({ key: 'm', ctrlKey: true, isComposing: true })).toBe(false)
  })

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

  it('wires Hold Ctrl+M press-to-talk in the composer', () => {
    const dock = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/ComposerDock.tsx'),
      'utf8'
    )
    expect(dock).toContain('isDictationHoldKey')
    expect(dock).toContain('holdDictationRef')
    expect(dock).toContain("addEventListener('keyup'")
  })
})
