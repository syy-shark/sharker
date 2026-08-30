import { describe, expect, it } from 'vitest'
import {
  clearMermaidHeightCache,
  clearMermaidSvgCache,
  estimateMermaidPlaceholderHeight,
  isMermaidLang,
  isMermaidLangPrefix,
  shouldRenderLiveMermaid,
  mermaidSlotHeight,
  mermaidSvgAspectStyle,
  mermaidSvgCacheKey,
  parseMermaidSvgSize,
  readCachedMermaidHeight,
  readCachedMermaidSvg,
  writeCachedMermaidHeight,
  writeCachedMermaidSvg
} from './mermaid-fence'

describe('mermaid-fence', () => {
  it('recognizes mermaid fence languages and rejects others', () => {
    expect(isMermaidLang('mermaid')).toBe(true)
    expect(isMermaidLang('MERMAID')).toBe(true)
    expect(isMermaidLang(' mmd ')).toBe(true)
    expect(isMermaidLang('js')).toBe(false)
    expect(isMermaidLang('diff')).toBe(false)
    expect(isMermaidLang('')).toBe(false)
    expect(isMermaidLang(undefined)).toBe(false)
    expect(isMermaidLangPrefix('mer')).toBe(true)
    expect(isMermaidLangPrefix('merm')).toBe(true)
    expect(isMermaidLangPrefix('mmd')).toBe(true)
    expect(isMermaidLangPrefix('md')).toBe(false)
    expect(isMermaidLangPrefix('mm')).toBe(false)
    expect(isMermaidLangPrefix('js')).toBe(false)
    expect(shouldRenderLiveMermaid({ closed: true, streaming: true })).toBe(false)
    expect(shouldRenderLiveMermaid({ closed: true, streaming: false })).toBe(true)
    expect(shouldRenderLiveMermaid({ closed: false, streaming: false })).toBe(false)
    expect(shouldRenderLiveMermaid({ closed: true })).toBe(true)

    clearMermaidSvgCache()
    expect(mermaidSvgCacheKey('graph TD\nA-->B\n', 'dark')).toBe('dark\ngraph TD\nA-->B')
    writeCachedMermaidSvg('graph TD\nA-->B\n', 'default', '<svg>one</svg>')
    expect(readCachedMermaidSvg('graph TD\nA-->B', 'default')).toBe('<svg>one</svg>')
    expect(readCachedMermaidSvg('graph TD\nA-->B', 'dark')).toBeUndefined()
    writeCachedMermaidSvg('graph TD\nA-->B', 'default', '  ')
    expect(readCachedMermaidSvg('graph TD\nA-->B', 'default')).toBe('<svg>one</svg>')
    for (let i = 0; i < 32; i++) writeCachedMermaidSvg(`g${i}`, 'default', `<svg>${i}</svg>`)
    expect(readCachedMermaidSvg('graph TD\nA-->B', 'default')).toBeUndefined()
    expect(readCachedMermaidSvg('g31', 'default')).toBe('<svg>31</svg>')
    clearMermaidSvgCache()
    expect(readCachedMermaidSvg('g31', 'default')).toBeUndefined()
    expect(parseMermaidSvgSize('<svg viewBox="0 0 200 100"></svg>')).toEqual({
      width: 200,
      height: 100
    })
    expect(parseMermaidSvgSize('<svg width="120px" height="80"></svg>')).toEqual({
      width: 120,
      height: 80
    })
    expect(parseMermaidSvgSize('<svg width="100%" height="100%"></svg>')).toBeNull()
    expect(mermaidSvgAspectStyle('<svg viewBox="-10 -10 40 20"></svg>')).toEqual({
      aspectRatio: '40 / 20'
    })
    expect(parseMermaidSvgSize('<svg></svg>')).toBeNull()
    expect(estimateMermaidPlaceholderHeight('')).toBe(120)
    expect(estimateMermaidPlaceholderHeight('graph TD\nA-->B')).toBeGreaterThanOrEqual(120)
    const tall = [
      'graph TD',
      ...Array.from({ length: 8 }, (_, i) => `N${i}[Node ${i}] --> N${i + 1}[Node ${i + 1}]`)
    ].join('\n')
    expect(estimateMermaidPlaceholderHeight(tall)).toBeGreaterThan(
      estimateMermaidPlaceholderHeight('graph TD\nA-->B')
    )
    clearMermaidHeightCache()
    expect(readCachedMermaidHeight('graph TD\nA-->B', 'default')).toBeNull()
    expect(writeCachedMermaidHeight('graph TD\nA-->B', 'default', 180)).toBe(180)
    expect(readCachedMermaidHeight('graph TD\nA-->B', 'default')).toBe(180)
    writeCachedMermaidSvg('flow', 'default', '<svg viewBox="0 0 200 220"></svg>')
    expect(readCachedMermaidHeight('flow', 'default')).toBe(220)
    expect(mermaidSlotHeight('flow', 'default', '<svg viewBox="0 0 200 220"></svg>')).toBeGreaterThanOrEqual(
      220
    )
    writeCachedMermaidHeight('flow', 'default', 12)
    expect(readCachedMermaidHeight('flow', 'default')).toBe(120)
    clearMermaidHeightCache()
    expect(readCachedMermaidHeight('flow', 'default')).toBeNull()
  })
})
