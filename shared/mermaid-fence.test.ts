import { describe, expect, it } from 'vitest'
import {
  clearMermaidHeightCache,
  clearMermaidSvgCache,
  estimateMermaidPlaceholderHeight,
  isMermaidLang,
  isMermaidLangPrefix,
  shouldRenderLiveMermaid,
  shouldWarmLiveMermaid,
  resolveLiveMermaidSvg,
  shouldShowMermaidSvg,
  shouldStartMermaidPaintJob,
  shouldDeferMermaidPaintJob,
  takeMermaidRenderJob,
  prefetchMermaidSvgs,
  readUiMermaidTheme,
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
    expect(shouldWarmLiveMermaid({ closed: true, streaming: true })).toBe(true)
    expect(shouldWarmLiveMermaid({ closed: true, streaming: false })).toBe(false)
    expect(shouldWarmLiveMermaid({ closed: false, streaming: true })).toBe(false)
    expect(shouldWarmLiveMermaid({ closed: true })).toBe(false)
    expect(resolveLiveMermaidSvg({ paint: false, svg: '<svg></svg>', cached: '<svg>c</svg>' })).toBe(
      ''
    )
    expect(resolveLiveMermaidSvg({ paint: true, svg: '', cached: '<svg>c</svg>' })).toBe(
      '<svg>c</svg>'
    )
    expect(resolveLiveMermaidSvg({ paint: true, svg: '<svg>s</svg>', cached: '<svg>c</svg>' })).toBe(
      '<svg>s</svg>'
    )
    expect(resolveLiveMermaidSvg({ paint: true, svg: '' })).toBe('')
    expect(
      shouldShowMermaidSvg({ closed: true, hasSource: true, failed: false, svg: '<svg></svg>' })
    ).toBe(true)
    expect(
      shouldShowMermaidSvg({ closed: true, hasSource: true, failed: false, svg: '' })
    ).toBe(false)
    expect(
      shouldShowMermaidSvg({ closed: false, hasSource: true, failed: false, svg: '<svg></svg>' })
    ).toBe(false)
    expect(
      shouldShowMermaidSvg({ closed: true, hasSource: true, failed: true, svg: '<svg></svg>' })
    ).toBe(false)
    expect(shouldStartMermaidPaintJob({ paint: true, hasCachedSvg: true })).toBe(false)
    expect(shouldStartMermaidPaintJob({ paint: true, hasCachedSvg: false })).toBe(true)
    expect(shouldStartMermaidPaintJob({ paint: false, hasCachedSvg: false })).toBe(false)
    expect(shouldDeferMermaidPaintJob({ preferImmediate: false })).toBe(true)
    expect(shouldDeferMermaidPaintJob({ preferImmediate: true })).toBe(false)
    expect(shouldDeferMermaidPaintJob({})).toBe(false)
    expect(readUiMermaidTheme()).toBe('default')
    expect(prefetchMermaidSvgs(['', '  '])).toBe(0)
    expect(prefetchMermaidSvgs(['graph TD\nA-->B'])).toBe(1)

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

  it('shares one mermaid render job and writes the svg cache', async () => {
    clearMermaidSvgCache()
    let starts = 0
    const start = () => {
      starts += 1
      return Promise.resolve('<svg viewBox="0 0 10 20"></svg>')
    }
    const first = takeMermaidRenderJob('graph TD\nJob-->Hold', 'default', start)
    const second = takeMermaidRenderJob('graph TD\nJob-->Hold', 'default', start)
    expect(starts).toBe(1)
    expect(await first).toBe('<svg viewBox="0 0 10 20"></svg>')
    expect(await second).toBe('<svg viewBox="0 0 10 20"></svg>')
    expect(readCachedMermaidSvg('graph TD\nJob-->Hold', 'default')).toBe(
      '<svg viewBox="0 0 10 20"></svg>'
    )
    expect(await takeMermaidRenderJob('graph TD\nJob-->Hold', 'default', start)).toBe(
      '<svg viewBox="0 0 10 20"></svg>'
    )
    expect(starts).toBe(1)

    let fails = 0
    const boom = () => {
      fails += 1
      return Promise.reject(new Error('boom'))
    }
    await expect(takeMermaidRenderJob('graph TD\nFail-->Retry', 'dark', boom)).rejects.toThrow(
      'boom'
    )
    await expect(takeMermaidRenderJob('graph TD\nFail-->Retry', 'dark', boom)).rejects.toThrow(
      'boom'
    )
    expect(fails).toBe(2)
    clearMermaidSvgCache()
  })
})
