import { describe, expect, it } from 'vitest'
import {
  clearMermaidSvgCache,
  isMermaidLang,
  mermaidSvgAspectStyle,
  mermaidSvgCacheKey,
  parseMermaidSvgSize,
  readCachedMermaidSvg,
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
  })
})
