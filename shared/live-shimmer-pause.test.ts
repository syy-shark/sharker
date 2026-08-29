import { describe, expect, it } from 'vitest'
import {
  bindLiveShimmerVisibility,
  LIVE_HIDDEN_CLASS,
  LIVE_SHIMMER_PAUSED_CLASS,
  observeOffscreenLiveShimmer,
  syncLiveHiddenClass
} from './live-shimmer-pause'

describe('live shimmer pause', () => {
  it('toggles the hidden class and pauses offscreen live rows', () => {
    const classes = new Set<string>()
    const root = {
      classList: {
        toggle: (name: string, force?: boolean) => {
          if (force) classes.add(name)
          else classes.delete(name)
        },
        contains: (name: string) => classes.has(name)
      }
    }
    syncLiveHiddenClass(true, root)
    expect(classes.has(LIVE_HIDDEN_CLASS)).toBe(true)
    syncLiveHiddenClass(false, root)
    expect(classes.has(LIVE_HIDDEN_CLASS)).toBe(false)

    let hidden = true
    const listeners = new Set<() => void>()
    const stopVis = bindLiveShimmerVisibility({
      get hidden() {
        return hidden
      },
      documentElement: root,
      addEventListener: (_type, listener) => {
        listeners.add(listener)
      },
      removeEventListener: (_type, listener) => {
        listeners.delete(listener)
      }
    })
    expect(classes.has(LIVE_HIDDEN_CLASS)).toBe(true)
    hidden = false
    for (const listener of listeners) listener()
    expect(classes.has(LIVE_HIDDEN_CLASS)).toBe(false)
    stopVis()
    expect(listeners.size).toBe(0)

    const paused = new Set<string>()
    const el = {
      classList: {
        toggle: (name: string, force?: boolean) => {
          if (force) paused.add(name)
          else paused.delete(name)
        },
        remove: (name: string) => {
          paused.delete(name)
        },
        contains: (name: string) => paused.has(name)
      }
    }
    let report: ((intersecting: boolean) => void) | undefined
    const stopIo = observeOffscreenLiveShimmer(el as unknown as Element, (cb) => {
      report = cb
      return { observe: () => undefined, disconnect: () => undefined }
    })
    report?.(false)
    expect(paused.has(LIVE_SHIMMER_PAUSED_CLASS)).toBe(true)
    report?.(true)
    expect(paused.has(LIVE_SHIMMER_PAUSED_CLASS)).toBe(false)
    paused.add(LIVE_SHIMMER_PAUSED_CLASS)
    stopIo()
    expect(paused.has(LIVE_SHIMMER_PAUSED_CLASS)).toBe(false)
  })
})
