import { describe, expect, it } from 'vitest'
import {
  fileOpenerPathSegment,
  fileOpenerUri,
  parseFileOpener,
  shouldOpenCitationInApp
} from './file-opener'

describe('file opener', () => {
  it('parses official destinations and builds citation URIs', () => {
    expect(parseFileOpener(undefined)).toBe('none')
    expect(parseFileOpener('vscode')).toBe('vscode')
    expect(parseFileOpener('cursor')).toBe('cursor')
    expect(parseFileOpener('vscode-insiders')).toBe('vscode-insiders')
    expect(parseFileOpener('windsurf')).toBe('windsurf')
    expect(parseFileOpener('none')).toBe('none')
    expect(parseFileOpener('zed')).toBe('none')
    expect(shouldOpenCitationInApp('none')).toBe(true)
    expect(shouldOpenCitationInApp('vscode')).toBe(false)
    expect(fileOpenerPathSegment('/Users/me/app/src/foo.ts')).toBe('/Users/me/app/src/foo.ts')
    expect(fileOpenerPathSegment('C:\\Users\\me\\app\\foo.ts')).toBe('/C:/Users/me/app/foo.ts')
    expect(fileOpenerUri('none', '/Users/me/app/src/foo.ts', 12)).toBeNull()
    expect(fileOpenerUri('vscode', '/Users/me/app/src/foo.ts', 12, 4)).toBe(
      'vscode://file/Users/me/app/src/foo.ts:12:4'
    )
    expect(fileOpenerUri('cursor', '/Users/me/app/src/foo.ts')).toBe(
      'cursor://file/Users/me/app/src/foo.ts'
    )
    expect(fileOpenerUri('windsurf', 'C:/repo/a.ts', 3)).toBe('windsurf://file/C:/repo/a.ts:3')
    expect(fileOpenerUri('vscode', '', 12)).toBeNull()
    expect(fileOpenerUri('vscode', '/Users/me/a.ts', 0, 2)).toBe('vscode://file/Users/me/a.ts')
  })
})
