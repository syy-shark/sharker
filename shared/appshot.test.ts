import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  APPSHOT_BOTH_META_CHORD,
  APPSHOT_DEFAULT_KEYS,
  APPSHOT_RECENT_MS,
  APPSHOTS_CAPTURE_INTRO,
  APPSHOTS_CLI_RESUME,
  APPSHOTS_DONT_WORK_HINT,
  APPSHOTS_ROUTE_INTRO,
  APPSHOTS_SETTINGS_INTRO,
  APPSHOTS_SETTINGS_LABEL,
  TAKE_AN_APPSHOT_LABEL,
  appshotChordToAccelerator,
  formatAppshotHotkey,
  isBothCommandAppshotHotkey,
  matchAppshotHotkey,
  parseAppshotHotkey,
  resolveAppshotTarget
} from './appshot'

describe('appshot', () => {
  it('keeps official Settings and Commands copy', () => {
    expect(APPSHOTS_SETTINGS_LABEL).toBe('Appshots')
    expect(TAKE_AN_APPSHOT_LABEL).toBe('Take an Appshot')
    expect(APPSHOTS_SETTINGS_INTRO).toMatch(/frontmost app window/)
    expect(APPSHOTS_ROUTE_INTRO).toMatch(/last 60 seconds/)
    expect(APPSHOTS_CAPTURE_INTRO).toMatch(/frontmost window only/)
    expect(APPSHOTS_DONT_WORK_HINT).toMatch(/Privacy & Security/)
    expect(APPSHOTS_DONT_WORK_HINT).toMatch(/Screen & System Audio Recording/)
    expect(APPSHOTS_DONT_WORK_HINT).toMatch(/Accessibility for Codex Computer Use/)
    expect(APPSHOTS_CLI_RESUME).toMatch(/resume a chat in the CLI/)
    expect(APPSHOTS_CLI_RESUME).toMatch(/can't create a new appshot/)
    const settingsSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/settings/AppshotSettings.tsx'),
      'utf8'
    )
    expect(settingsSrc).toContain('APPSHOTS_ROUTE_INTRO')
    expect(settingsSrc).toContain('APPSHOTS_CAPTURE_INTRO')
    expect(settingsSrc).toContain('APPSHOTS_DONT_WORK_HINT')
    expect(settingsSrc).toContain('APPSHOTS_CLI_RESUME')
    expect(settingsSrc).not.toContain('plugin')
    expect(formatAppshotHotkey(undefined)).toBe(APPSHOT_DEFAULT_KEYS)
    expect(parseAppshotHotkey('')).toBe(APPSHOT_BOTH_META_CHORD)
    expect(appshotChordToAccelerator('both-meta')).toBeNull()
    expect(appshotChordToAccelerator('mod+shift+.')).toBe('CommandOrControl+Shift+.')
  })

  it('opens a new chat unless the last 60 seconds were in one', () => {
    expect(
      resolveAppshotTarget({
        now: 80_000,
        lastInteractedAt: 10_000,
        lastAppshotConversationId: 'old',
        activeConversationId: 'cur'
      })
    ).toEqual({ target: 'new_chat', conversationId: null })
    expect(
      resolveAppshotTarget({
        now: 20_000,
        lastInteractedAt: 20_000 - APPSHOT_RECENT_MS,
        lastAppshotConversationId: null,
        activeConversationId: 'cur'
      })
    ).toEqual({ target: 'recent_chat', conversationId: 'cur' })
    expect(
      resolveAppshotTarget({
        now: 20_000,
        lastInteractedAt: 19_000,
        lastAppshotConversationId: 'shot-1',
        activeConversationId: null
      })
    ).toEqual({ target: 'recent_chat', conversationId: 'shot-1' })
  })

  it('matches official both-Command and a custom chord', () => {
    expect(
      isBothCommandAppshotHotkey({
        key: 'Meta',
        leftMeta: true,
        rightMeta: true
      })
    ).toBe(true)
    expect(
      isBothCommandAppshotHotkey({
        key: 'Meta',
        leftMeta: true,
        rightMeta: false
      })
    ).toBe(false)
    expect(
      matchAppshotHotkey('mod+shift+.', {
        key: '.',
        metaKey: true,
        ctrlKey: false,
        altKey: false,
        shiftKey: true
      })
    ).toBe(true)
  })
})
