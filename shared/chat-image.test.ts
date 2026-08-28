import { describe, expect, it } from 'vitest'
import {
  canExportChatImage,
  chatImageAspectStyle,
  isRemoteChatImageSrc,
  isWorkspaceChatImageSrc,
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
  })
})
