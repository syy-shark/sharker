/**
 * 官方 view_image 参数 / 短结果 / 回灌解析。
 * @see shared/view-image.ts
 */
import { describe, expect, it } from 'vitest'
import {
  formatViewImageActivity,
  formatViewImageToolOutput,
  isViewImageDump,
  isViewImageRasterExt,
  isViewImageTool,
  mimeForViewImagePath,
  parseViewImageDetail,
  parseViewImageToolOutput,
  viewedImagePathFromTool,
  viewImageApiDetail
} from './view-image'

describe('view-image', () => {
  it('recognizes the official name and the read_image alias', () => {
    expect(isViewImageTool('view_image')).toBe(true)
    expect(isViewImageTool('read_image')).toBe(true)
    expect(isViewImageTool('read_file')).toBe(false)
    expect(formatViewImageActivity()).toBe('Viewed Image')
    expect(isViewImageDump('Viewed image: /tmp/shot.png')).toBe(true)
    expect(isViewImageDump('path: /tmp/shot.png')).toBe(true)
    expect(isViewImageDump('Read package.json')).toBe(false)
  })

  it('only treats original as the official detail override', () => {
    expect(parseViewImageDetail('original')).toBe('original')
    expect(parseViewImageDetail('Original')).toBe('original')
    expect(parseViewImageDetail('low')).toBeNull()
    expect(parseViewImageDetail('')).toBeNull()
    expect(viewImageApiDetail('original')).toBe('high')
    expect(viewImageApiDetail(null)).toBe('low')
  })

  it('maps image extensions and keeps SVG out of raster vision', () => {
    expect(mimeForViewImagePath('/tmp/a.PNG')).toBe('image/png')
    expect(mimeForViewImagePath('/tmp/a.jpg')).toBe('image/jpeg')
    expect(mimeForViewImagePath('/tmp/a.svg')).toBe('image/svg+xml')
    expect(mimeForViewImagePath('/tmp/a.ts')).toBeNull()
    expect(isViewImageRasterExt('.png')).toBe(true)
    expect(isViewImageRasterExt('.svg')).toBe(false)
  })

  it('formats a short official-style result and parses it back', () => {
    const output = formatViewImageToolOutput({
      path: '/tmp/shot.png',
      bytes: 4096,
      mime: 'image/png',
      detail: null
    })
    expect(output).toContain('Viewed image: /tmp/shot.png')
    expect(output).not.toMatch(/base64/)
    expect(parseViewImageToolOutput(output)).toEqual({
      path: '/tmp/shot.png',
      detail: null
    })
    expect(
      parseViewImageToolOutput(
        formatViewImageToolOutput({
          path: '/tmp/ui.png',
          bytes: 12,
          mime: 'image/png',
          detail: 'original'
        })
      )
    ).toEqual({ path: '/tmp/ui.png', detail: 'original' })
    expect(viewedImagePathFromTool('view_image', output)).toBe('/tmp/shot.png')
    expect(viewedImagePathFromTool('read_file', output)).toBeNull()
    expect(parseViewImageToolOutput('no path here')).toBeNull()
    expect(
      parseViewImageToolOutput(
        formatViewImageToolOutput({
          path: '/tmp/my shot.png',
          bytes: 8,
          mime: 'image/png',
          detail: null
        })
      )
    ).toEqual({ path: '/tmp/my shot.png', detail: null })
  })
})
