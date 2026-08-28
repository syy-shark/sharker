import { describe, expect, it } from 'vitest'
import {
  dataUrlMimeForPath,
  filePreviewKind,
  filePreviewUnsupportedMessage
} from './file-preview'

describe('file preview kinds', () => {
  it('splits images, pdf, office binaries, and text', () => {
    expect(filePreviewKind('shot.png')).toBe('image')
    expect(filePreviewKind('/abs/Photo.JPEG')).toBe('image')
    expect(filePreviewKind('spec.pdf')).toBe('pdf')
    expect(filePreviewKind('sheet.xlsx')).toBe('unsupported')
    expect(filePreviewKind('notes.docx')).toBe('unsupported')
    expect(filePreviewKind('src/app.ts')).toBe('text')
    expect(filePreviewKind('data.csv')).toBe('text')
    expect(filePreviewKind('README')).toBe('text')
    expect(dataUrlMimeForPath('a.webp')).toBe('image/webp')
    expect(dataUrlMimeForPath('a.pdf')).toBe('application/pdf')
    expect(filePreviewUnsupportedMessage('a.xlsx')).toMatch(/表格/)
  })
})
