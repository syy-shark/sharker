import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  PASTE_TEXT_ATTACHMENT_THRESHOLD,
  PASTED_TEXT_ATTACHMENT_NAME,
  SHOW_IN_TEXT_FIELD_LABEL,
  classifyPastedAttachment,
  clipboardPlainText,
  composerEmptyAttachmentPrompt,
  decideClipboardPaste,
  htmlToPlainText,
  looksLikeFilePathList,
  materializeComposerInput,
  parseLeadingSlash,
  pastedTextAttachmentName,
  utf8ToBase64
} from './composer-paste'

describe('composer paste intake', () => {
  it('prefers text/plain over image files (Word/PPT clipboard)', () => {
    const decision = decideClipboardPaste({
      getData: (type) => (type === 'text/plain' ? '从 Word 复制的段落' : ''),
      hasImageFiles: true
    })
    expect(decision).toEqual({ action: 'insert_text', text: '从 Word 复制的段落' })
  })

  it('normalizes CRLF from Word-style plain text', () => {
    expect(clipboardPlainText((type) => (type === 'text/plain' ? 'a\r\nb\rc' : ''))).toBe(
      'a\nb\nc'
    )
  })

  it('falls back to stripped HTML when plain text is empty', () => {
    expect(
      clipboardPlainText((type) =>
        type === 'text/html' ? '<p>Hello&nbsp;<b>World</b></p>' : ''
      )
    ).toContain('Hello World')
  })

  it('attaches images only when there is no usable text', () => {
    expect(
      decideClipboardPaste({
        getData: () => '',
        hasImageFiles: true
      })
    ).toEqual({ action: 'attach_images' })
  })

  it('attaches Finder/Explorer files even when the clipboard also has a path', () => {
    expect(
      decideClipboardPaste({
        getData: (type) => (type === 'text/plain' ? '/Users/me/repo/app.ts' : ''),
        hasImageFiles: false,
        hasNonImageFiles: true
      })
    ).toEqual({ action: 'attach_files' })
    expect(
      decideClipboardPaste({
        getData: (type) => (type === 'text/plain' ? 'C:\\repo\\shot.png' : ''),
        hasImageFiles: true,
        hasNonImageFiles: false
      })
    ).toEqual({ action: 'attach_images' })
    expect(
      decideClipboardPaste({
        getData: (type) => (type === 'text/uri-list' ? 'file:///Users/me/a.ts' : ''),
        hasImageFiles: false,
        hasNonImageFiles: true
      })
    ).toEqual({ action: 'attach_files' })
  })

  it('still prefers Word text over the Office image layer', () => {
    expect(
      decideClipboardPaste({
        getData: (type) => (type === 'text/plain' ? '从 Word 复制的段落' : ''),
        hasImageFiles: true,
        hasNonImageFiles: false
      })
    ).toEqual({ action: 'insert_text', text: '从 Word 复制的段落' })
  })

  it('classifies source files as text and rejects binaries', () => {
    expect(classifyPastedAttachment('app.ts', '')).toEqual({
      kind: 'text',
      mimeType: 'text/plain',
      ext: 'ts'
    })
    expect(classifyPastedAttachment('notes.json', 'application/json').kind).toBe('text')
    expect(classifyPastedAttachment('shot.png', '').kind).toBe('image')
    expect(classifyPastedAttachment('payload.zip', '')).toMatchObject({ kind: 'reject' })
    expect(classifyPastedAttachment('Makefile', '').kind).toBe('text')
    expect(classifyPastedAttachment('Dockerfile', '').kind).toBe('text')
  })

  it('treats absolute path lists as file drops', () => {
    expect(looksLikeFilePathList('/Users/me/a.ts')).toBe(true)
    expect(looksLikeFilePathList('C:\\repo\\a.ts\nC:\\repo\\b.md')).toBe(true)
    expect(looksLikeFilePathList('请看 /Users/me/a.ts')).toBe(false)
  })

  it('keeps named source attachments out of slash folding', () => {
    const atts = [{ kind: 'text' as const, name: 'app.ts', text: 'export const n = 1' }]
    expect(materializeComposerInput('', atts)).toEqual({ text: '', attachments: atts })
    expect(materializeComposerInput('/goal', atts)).toEqual({ text: '/goal', attachments: atts })
  })

  it('converts oversized paste into Pasted text.txt unless shift-forced inline', () => {
    expect(SHOW_IN_TEXT_FIELD_LABEL).toBe('Show in text field')
    expect(PASTE_TEXT_ATTACHMENT_THRESHOLD).toBe(10_001)
    expect(
      decideClipboardPaste({
        getData: (type) => (type === 'text/plain' ? 'x'.repeat(10_000) : ''),
        hasImageFiles: false
      })
    ).toEqual({ action: 'insert_text', text: 'x'.repeat(10_000) })
    const text = 'x'.repeat(PASTE_TEXT_ATTACHMENT_THRESHOLD)
    expect(
      decideClipboardPaste({
        getData: (type) => (type === 'text/plain' ? text : ''),
        hasImageFiles: false
      })
    ).toEqual({ action: 'attach_text', text, name: PASTED_TEXT_ATTACHMENT_NAME })
    expect(
      decideClipboardPaste({
        getData: (type) => (type === 'text/plain' ? text : ''),
        hasImageFiles: true,
        forcePlainText: true
      })
    ).toEqual({ action: 'insert_text', text })
  })

  it('folds empty /goal plus pasted text into slash args', () => {
    const next = materializeComposerInput('/goal', [
      { kind: 'text', text: '把登录做成玻璃风' }
    ])
    expect(next.text).toBe('/goal 把登录做成玻璃风')
    expect(next.attachments).toEqual([])
  })

  it('uses pasted text as the prompt when the composer is empty', () => {
    const next = materializeComposerInput('   ', [
      { kind: 'text', text: '实现粘贴优先' },
      { kind: 'image' }
    ])
    expect(next.text).toBe('实现粘贴优先')
    expect(next.attachments).toEqual([{ kind: 'image' }])
  })

  it('keeps text attachments as context when the user typed a real prompt', () => {
    const atts = [{ kind: 'text' as const, text: 'LOGS' }]
    expect(materializeComposerInput('解释这份日志', atts)).toEqual({
      text: '解释这份日志',
      attachments: atts
    })
  })

  it('wires official Show in text field on paste and selection chips', () => {
    const composerSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/ComposerDock.tsx'),
      'utf8'
    )
    expect(composerSrc).toContain('SHOW_IN_TEXT_FIELD_LABEL')
    expect(composerSrc).not.toContain('插入正文')
  })

  it('names sequential pasted text attachments', () => {
    expect(pastedTextAttachmentName(0)).toBe(PASTED_TEXT_ATTACHMENT_NAME)
    expect(pastedTextAttachmentName(1)).toBe('Pasted text 2.txt')
  })

  it('parses leading slash commands', () => {
    expect(parseLeadingSlash('/goal')).toEqual({ name: 'goal', args: '' })
    expect(parseLeadingSlash('/goal  already')).toEqual({ name: 'goal', args: 'already' })
    expect(parseLeadingSlash('not a command')).toBeNull()
  })

  it('encodes utf8 for data URLs', () => {
    expect(utf8ToBase64('粘贴')).toBe(Buffer.from('粘贴', 'utf8').toString('base64'))
    expect(composerEmptyAttachmentPrompt([{ kind: 'image' }])).toBe('请看这张图片。')
    expect(composerEmptyAttachmentPrompt([{ kind: 'text' }])).toBe('请看这些附件。')
  })

  it('strips scripts from HTML fallback', () => {
    expect(htmlToPlainText('<p>ok</p><script>alert(1)</script>')).toBe('ok\n')
  })
})
