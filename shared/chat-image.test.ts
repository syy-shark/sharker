import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'
import {
  canExportChatImage,
  chatImageMenuItems,
  chatImageAspectStyle,
  chatImageSlotMinHeight,
  liveChatImageMinHeight,
  chatImageLightboxFit,
  filePreviewImageFit,
  isRemoteChatImageSrc,
  isWorkspaceChatImageSrc,
  peekChatImageSizeFromDataUrl,
  prefetchChatImageSizes,
  takeChatImagePrefetchJob,
  readCachedChatImageSize,
  readCachedWorkspaceImageDataUrl,
  resolveWorkspaceChatImagePath,
  suggestedImageFilename,
  writeCachedChatImageSize,
  writeCachedWorkspaceImageDataUrl
} from './chat-image'

describe('chat-image', () => {
  it('suggests a safe filename and only exports http / data / attachment images', () => {
    expect(suggestedImageFilename({ name: 'shot.png' })).toBe('shot.png')
    expect(suggestedImageFilename({ name: '../a/b.jpg' })).toBe('b.jpg')
    expect(suggestedImageFilename({ alt: '示意' })).toBe('示意.png')
    expect(suggestedImageFilename({ src: 'https://a.test/p/foo.JPEG?x=1' })).toBe('foo.jpg')
    expect(suggestedImageFilename({ src: 'data:image/jpeg;base64,aa' })).toBe('image.jpg')
    expect(suggestedImageFilename({ name: 'weird?name', src: 'https://a.test/x.webp' })).toBe(
      'weird-name.webp'
    )
    expect(suggestedImageFilename({})).toBe('image.png')
    expect(canExportChatImage({ filePath: '/tmp/a.png' })).toBe(true)
    expect(canExportChatImage({ src: 'https://a.test/p.png' })).toBe(true)
    expect(canExportChatImage({ src: 'data:image/png;base64,aa' })).toBe(true)
    expect(canExportChatImage({ src: 'javascript:alert(1)' })).toBe(false)
    expect(canExportChatImage({ src: 'file:///etc/passwd' })).toBe(false)
    expect(canExportChatImage({})).toBe(false)
    expect(readCachedChatImageSize('https://a.test/p.png')).toBeNull()
    expect(writeCachedChatImageSize('https://a.test/p.png', { width: 800, height: 400 })).toEqual({
      width: 800,
      height: 400
    })
    expect(readCachedChatImageSize('https://a.test/p.png')).toEqual({ width: 800, height: 400 })
    expect(chatImageAspectStyle({ width: 800, height: 400 })).toEqual({ aspectRatio: '800 / 400' })
    expect(chatImageAspectStyle({ width: 0, height: 10 })).toBeUndefined()
    writeCachedChatImageSize('https://a.test/zero.png', { width: 0, height: 10 })
    expect(readCachedChatImageSize('https://a.test/zero.png')).toBeNull()
    expect(readCachedChatImageSize('')).toBeNull()
    expect(isRemoteChatImageSrc('https://a.test/p.png')).toBe(true)
    expect(isRemoteChatImageSrc('data:image/png;base64,aa')).toBe(true)
    expect(isWorkspaceChatImageSrc('docs/foo.png')).toBe(true)
    expect(isWorkspaceChatImageSrc('./shot.webp')).toBe(true)
    expect(isWorkspaceChatImageSrc('https://a.test/p.png')).toBe(false)
    expect(isWorkspaceChatImageSrc('file:///tmp/a.png')).toBe(false)
    expect(isWorkspaceChatImageSrc('javascript:alert(1)')).toBe(false)
    expect(isWorkspaceChatImageSrc('src/App.tsx')).toBe(false)
    expect(resolveWorkspaceChatImagePath('docs/foo.png', '/tmp/proj')).toBe('/tmp/proj/docs/foo.png')
    expect(resolveWorkspaceChatImagePath('./shot.webp', '/tmp/proj', ['/tmp/extra'])).toBe(
      '/tmp/proj/shot.webp'
    )
    expect(resolveWorkspaceChatImagePath('extra/pic.png', '/tmp/proj', ['/tmp/extra'])).toBe(
      '/tmp/extra/pic.png'
    )
    expect(resolveWorkspaceChatImagePath('docs/foo.png', '')).toBe('')
    expect(resolveWorkspaceChatImagePath('file:///tmp/a.png', '/tmp/proj')).toBe('')
    expect(readCachedWorkspaceImageDataUrl('/tmp/proj/docs/foo.png')).toBeNull()
    expect(
      writeCachedWorkspaceImageDataUrl('/tmp/proj/docs/foo.png', 'data:image/png;base64,aa')
    ).toBe('data:image/png;base64,aa')
    expect(readCachedWorkspaceImageDataUrl('/tmp/proj/docs/foo.png')).toBe('data:image/png;base64,aa')
    writeCachedWorkspaceImageDataUrl('/tmp/proj/docs/foo.png', 'https://evil.test/x.png')
    expect(readCachedWorkspaceImageDataUrl('/tmp/proj/docs/foo.png')).toBe('data:image/png;base64,aa')
    const png = `data:image/png;base64,${Buffer.from(
      new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x01, 0x40, 0x00, 0x00, 0x00, 0xc8
      ])
    ).toString('base64')}`
    expect(peekChatImageSizeFromDataUrl(png)).toEqual({ width: 320, height: 200 })
    expect(peekChatImageSizeFromDataUrl('data:image/png;base64,aa')).toBeNull()
    expect(peekChatImageSizeFromDataUrl('https://a.test/p.png')).toBeNull()
    writeCachedWorkspaceImageDataUrl('/tmp/proj/docs/header.png', png)
    expect(readCachedChatImageSize('/tmp/proj/docs/header.png')).toEqual({ width: 320, height: 200 })
    expect(chatImageSlotMinHeight(null, true)).toBe(48)
    expect(chatImageSlotMinHeight({ width: 320, height: 200 }, true)).toBe(0)
    expect(chatImageSlotMinHeight(null, false)).toBe(0)
    expect(liveChatImageMinHeight(48, { width: 16, height: 16 }, false)).toBe(48)
    expect(liveChatImageMinHeight(0, null, true)).toBe(48)
    expect(prefetchChatImageSizes(['', '  '])).toBe(0)
    expect(prefetchChatImageSizes([png])).toBe(1)
    expect(readCachedChatImageSize(png)).toEqual({ width: 320, height: 200 })
    expect(chatImageMenuItems({ canExport: true }).map((item) => item.action)).toEqual([
      'copy-image',
      'save'
    ])
    expect(
      chatImageMenuItems({
        workspace: true,
        canExport: true,
        canLightbox: true,
        platform: 'darwin'
      }).map((item) => item.action)
    ).toEqual(['lightbox', 'open', 'reveal', 'copy-path', 'copy-image', 'save'])
    expect(chatImageMenuItems({ workspace: true, platform: 'darwin' })[1]?.title).toBe(
      'Open in Finder'
    )
    expect(
      chatImageMenuItems({ workspace: true, platform: 'darwin', canLightbox: true })[2]?.title
    ).toBe('Open in Finder')
    expect(chatImageMenuItems({ workspace: true, platform: 'darwin' })[2]?.title).toBe('Copy path')
    expect(chatImageMenuItems({ canLightbox: true })[0]).toEqual({
      action: 'lightbox',
      title: '查看大图'
    })
    expect(chatImageMenuItems({})).toEqual([])
    const viewport = { width: 1200, height: 800 }
    const landscape = chatImageLightboxFit({ width: 4000, height: 2000 }, viewport)
    expect(landscape.width).toBeLessThanOrEqual(1200 - 96)
    expect(landscape.height).toBeLessThanOrEqual(800 - 96)
    expect(landscape.width / landscape.height).toBeCloseTo(2, 2)
    expect(landscape.scale).toBeLessThan(1)
    const portrait = chatImageLightboxFit({ width: 2000, height: 4000 }, viewport)
    expect(portrait.width).toBeLessThanOrEqual(1200 - 96)
    expect(portrait.height).toBeLessThanOrEqual(800 - 96)
    expect(portrait.scale).toBeLessThan(1)
    const small = chatImageLightboxFit({ width: 200, height: 100 }, viewport)
    expect(small).toEqual({ width: 200, height: 100, scale: 1 })
    expect(chatImageLightboxFit({ width: 4000, height: 2000 }, viewport)).toEqual(landscape)
    expect(chatImageLightboxFit({ width: 0, height: 10 }, viewport).scale).toBe(0)
    expect(chatImageLightboxFit({ width: 100, height: 80 }, { width: 0, height: 600 }).scale).toBe(0)
    const pane = filePreviewImageFit({ width: 2000, height: 3000 }, { width: 280, height: 400 })
    expect(pane.width).toBeLessThanOrEqual(280 - 24)
    expect(pane.height).toBeLessThanOrEqual(400 - 24)
    expect(pane.scale).toBeLessThan(1)
    expect(filePreviewImageFit({ width: 80, height: 40 }, { width: 280, height: 400 })).toEqual({
      width: 80,
      height: 40,
      scale: 1
    })
    const imageSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/ChatImage.tsx'),
      'utf8'
    )
    expect(imageSrc).toContain('FILE_CLOSE_LABEL')
    expect(imageSrc).toContain('prefetchRemoteChatImageSize')
    expect(imageSrc).not.toContain('aria-label="关闭图片预览"')
  })

  it('shares one chat image size job and writes the size cache', async () => {
    let starts = 0
    const start = () => {
      starts += 1
      return Promise.resolve({ width: 64, height: 32 })
    }
    const first = takeChatImagePrefetchJob('https://a.test/job.png', start)
    const second = takeChatImagePrefetchJob('https://a.test/job.png', start)
    expect(starts).toBe(1)
    expect(await first).toEqual({ width: 64, height: 32 })
    expect(await second).toEqual({ width: 64, height: 32 })
    expect(readCachedChatImageSize('https://a.test/job.png')).toEqual({ width: 64, height: 32 })
    expect(await takeChatImagePrefetchJob('https://a.test/job.png', start)).toEqual({
      width: 64,
      height: 32
    })
    expect(starts).toBe(1)

    let fails = 0
    const boom = () => {
      fails += 1
      return Promise.reject(new Error('boom'))
    }
    await expect(takeChatImagePrefetchJob('https://a.test/fail.png', boom)).rejects.toThrow('boom')
    await expect(takeChatImagePrefetchJob('https://a.test/fail.png', boom)).rejects.toThrow('boom')
    expect(fails).toBe(2)
  })
})
