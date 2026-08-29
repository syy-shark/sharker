import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'
import {
  dataUrlMimeForPath,
  filePreviewKind,
  filePreviewUnsupportedMessage,
  fileTreeReloadMode,
  defaultMarkdownFileView,
  isHtmlPreviewPath,
  isMarkdownPreviewPath,
  isPathInsideRoot,
  nextMarkdownFileView,
  resolveMarkdownPreviewImageSrc,
  resolveWorkspaceHtmlFileUrl,
  splitMarkdownFrontmatter,
  shouldAnimateFileTreeInsert,
  shouldOpenHtmlInAppBrowser,
  shouldRereadOpenPreviewOnReload,
  maxDiffGotoLine,
  parseGoToLineInput,
  previewPathTouchedByWrites,
  toBrowserFileUrl
} from './file-preview'

describe('file preview kinds', () => {
  it('splits images, pdf, office binaries, and text', () => {
    expect(filePreviewKind('shot.png')).toBe('image')
    expect(filePreviewKind('/abs/Photo.JPEG')).toBe('image')
    expect(filePreviewKind('spec.pdf')).toBe('pdf')
    expect(filePreviewKind('sheet.xlsx')).toBe('unsupported')
    expect(filePreviewKind('notes.docx')).toBe('unsupported')
    expect(filePreviewKind('src/app.ts')).toBe('text')
    expect(filePreviewKind('docs/index.html')).toBe('text')
    expect(filePreviewKind('data.csv')).toBe('text')
    expect(filePreviewKind('README')).toBe('text')
    expect(isHtmlPreviewPath('docs/index.html')).toBe(true)
    expect(isHtmlPreviewPath('docs/index.html#gallery')).toBe(true)
    expect(isHtmlPreviewPath('page.HTM')).toBe(true)
    expect(isHtmlPreviewPath('src/app.ts')).toBe(false)
    expect(shouldOpenHtmlInAppBrowser('docs/index.html')).toBe(true)
    expect(shouldOpenHtmlInAppBrowser('docs/index.html', 12)).toBe(false)
    expect(shouldOpenHtmlInAppBrowser('src/app.ts')).toBe(false)
    expect(toBrowserFileUrl('/tmp/proj/docs/a.html')).toBe('file:///tmp/proj/docs/a.html')
    expect(toBrowserFileUrl('/tmp/foo bar.html')).toBe('file:///tmp/foo%20bar.html')
    expect(isPathInsideRoot('/tmp/proj/docs/a.html', '/tmp/proj')).toBe(true)
    expect(isPathInsideRoot('/tmp/outside.html', '/tmp/proj')).toBe(false)
    expect(resolveWorkspaceHtmlFileUrl('docs/a.html', '/tmp/proj')).toBe(
      'file:///tmp/proj/docs/a.html'
    )
    expect(resolveWorkspaceHtmlFileUrl('docs/a.html#ok', '/tmp/proj')).toBe(
      'file:///tmp/proj/docs/a.html#ok'
    )
    expect(resolveWorkspaceHtmlFileUrl('file:///tmp/proj/docs/a.html', '/tmp/proj')).toBe(
      'file:///tmp/proj/docs/a.html'
    )
    expect(resolveWorkspaceHtmlFileUrl('../outside.html', '/tmp/proj')).toBe('')
    expect(resolveWorkspaceHtmlFileUrl('file:///etc/passwd.html', '/tmp/proj')).toBe('')
    expect(resolveWorkspaceHtmlFileUrl('docs/a.ts', '/tmp/proj')).toBe('')
    expect(resolveWorkspaceHtmlFileUrl('https://ex.com/a.html', '/tmp/proj')).toBe('')
    expect(resolveWorkspaceHtmlFileUrl('extra/page.html', '/tmp/proj', ['/tmp/extra'])).toBe(
      'file:///tmp/extra/page.html'
    )
    expect(isMarkdownPreviewPath('README.md')).toBe(true)
    expect(isMarkdownPreviewPath('notes.markdown')).toBe(true)
    expect(isMarkdownPreviewPath('src/app.ts')).toBe(false)
    expect(defaultMarkdownFileView('README.md')).toBe('preview')
    expect(defaultMarkdownFileView('README.md', 12)).toBe('source')
    expect(nextMarkdownFileView('README.md', undefined, { path: '/tmp/proj/README.md', markdownView: 'source' }, true)).toBe(
      'source'
    )
    expect(nextMarkdownFileView('/tmp/proj/README.md', 3, { path: '/tmp/proj/README.md', markdownView: 'preview' }, false)).toBe(
      'source'
    )
    expect(splitMarkdownFrontmatter('---\ntitle: A\n---\n# Hi\n').body).toBe('# Hi\n')
    expect(splitMarkdownFrontmatter('---\ntitle: A\n---\n# Hi\n').raw).toBe('title: A')
    expect(splitMarkdownFrontmatter('# Hi\n').raw).toBe('')
    expect(
      resolveMarkdownPreviewImageSrc('assets/a.png', '/tmp/proj/docs/guide.md', '/tmp/proj')
    ).toBe('/tmp/proj/docs/assets/a.png')
    expect(
      resolveMarkdownPreviewImageSrc('docs/assets/a.png', '/tmp/proj/docs/guide.md', '/tmp/proj')
    ).toBe('/tmp/proj/docs/docs/assets/a.png')
    expect(
      resolveMarkdownPreviewImageSrc('/tmp/proj/docs/assets/a.png', '/tmp/proj/docs/guide.md', '/tmp/proj')
    ).toBe('/tmp/proj/docs/assets/a.png')
    expect(
      resolveMarkdownPreviewImageSrc('../secret.png', '/tmp/proj/docs/guide.md', '/tmp/proj')
    ).toBe('/tmp/proj/secret.png')
    expect(
      resolveMarkdownPreviewImageSrc('../../outside.png', '/tmp/proj/docs/guide.md', '/tmp/proj')
    ).toBe('')
    expect(resolveMarkdownPreviewImageSrc('file:///tmp/proj/a.png', '/tmp/proj/a.md', '/tmp/proj')).toBe('')
    expect(dataUrlMimeForPath('a.webp')).toBe('image/webp')
    expect(dataUrlMimeForPath('a.pdf')).toBe('application/pdf')
    expect(filePreviewUnsupportedMessage('a.xlsx')).toMatch(/表格/)
    expect(parseGoToLineInput('12', 40)).toBe(12)
    expect(parseGoToLineInput(' 99 ', 20)).toBe(20)
    expect(parseGoToLineInput('0', 10)).toBe(null)
    expect(parseGoToLineInput('ab', 10)).toBe(null)
    expect(parseGoToLineInput('3', 0)).toBe(1)
    expect(maxDiffGotoLine([{ newLine: 12 }, { oldLine: 40 }])).toBe(40)
    expect(maxDiffGotoLine([])).toBe(1)
    expect(maxDiffGotoLine(undefined)).toBe(1)
    expect(previewPathTouchedByWrites('/proj/src/a.ts', ['src/a.ts'], '/proj')).toBe(true)
    expect(previewPathTouchedByWrites('src/a.ts', ['src/a.ts'], '/proj')).toBe(true)
    expect(previewPathTouchedByWrites('/proj/src/b.ts', ['src/a.ts'], '/proj')).toBe(false)
    expect(
      previewPathTouchedByWrites('/tmp/extra/lib.ts', ['extra/lib.ts'], '/proj', ['/tmp/extra'])
    ).toBe(true)
    expect(previewPathTouchedByWrites('/proj/src/a.ts', [], '/proj')).toBe(false)
    expect(fileTreeReloadMode('workspace')).toEqual({
      clearPreview: true,
      resetExpanded: true,
      showLoading: true
    })
    expect(fileTreeReloadMode('revision')).toEqual({
      clearPreview: false,
      resetExpanded: false,
      showLoading: false
    })
    expect(fileTreeReloadMode('focus')).toEqual(fileTreeReloadMode('revision'))
    expect(shouldAnimateFileTreeInsert(false)).toBe(true)
    expect(shouldAnimateFileTreeInsert(true)).toBe(false)
    expect(shouldRereadOpenPreviewOnReload('revision')).toBe(true)
    expect(shouldRereadOpenPreviewOnReload('focus')).toBe(true)
    expect(shouldRereadOpenPreviewOnReload('workspace')).toBe(false)
    const treeSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/panel/FileTree.tsx'),
      'utf8'
    )
    expect(treeSrc).toContain('FileMarkdownPreview')
    expect(treeSrc).toContain('nextMarkdownFileView')
    expect(treeSrc).toContain('markdownView')
  })
})
