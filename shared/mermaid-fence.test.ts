import { describe, expect, it } from 'vitest'
import { isMermaidLang } from './mermaid-fence'

describe('mermaid-fence', () => {
  it('recognizes mermaid fence languages and rejects others', () => {
    expect(isMermaidLang('mermaid')).toBe(true)
    expect(isMermaidLang('MERMAID')).toBe(true)
    expect(isMermaidLang(' mmd ')).toBe(true)
    expect(isMermaidLang('js')).toBe(false)
    expect(isMermaidLang('diff')).toBe(false)
    expect(isMermaidLang('')).toBe(false)
    expect(isMermaidLang(undefined)).toBe(false)
  })
})
