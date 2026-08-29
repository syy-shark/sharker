/**
 * 直播扫光在后台或屏外停动画，减轻 GPU（对标 Codex #16857 / #40531）。
 * 进度圈仍转（对标 #22787）。
 * @see shared/ARCH.md
 */

/** `document.hidden` 时挂在 `html` 上 */
export const LIVE_HIDDEN_CLASS = 'live-hidden'

/** 屏外直播行挂在容器上，子孙扫光一并停 */
export const LIVE_SHIMMER_PAUSED_CLASS = 'live-shimmer-paused'

/** 同步后台类；测试可传入假 root */
export function syncLiveHiddenClass(
  hidden: boolean,
  root: { classList: { toggle: (name: string, force?: boolean) => unknown } } = globalThis.document
    ?.documentElement
): void {
  root?.classList.toggle(LIVE_HIDDEN_CLASS, hidden)
}

export type LiveVisibilityDocument = {
  hidden: boolean
  documentElement: { classList: { toggle: (name: string, force?: boolean) => unknown } }
  addEventListener: (type: string, listener: () => void) => void
  removeEventListener: (type: string, listener: () => void) => void
}

/** 窗口不可见时停扫光；回到前台恢复 */
export function bindLiveShimmerVisibility(
  doc: LiveVisibilityDocument = globalThis.document
): () => void {
  const sync = (): void => {
    syncLiveHiddenClass(doc.hidden, doc.documentElement)
  }
  sync()
  doc.addEventListener('visibilitychange', sync)
  return () => {
    doc.removeEventListener('visibilitychange', sync)
    syncLiveHiddenClass(false, doc.documentElement)
  }
}

export type OffscreenShimmerObserver = {
  observe: (target: Element) => void
  disconnect: () => void
}

/** 屏外则加暂停类；回到视口去掉。测试可注入 observer。 */
export function observeOffscreenLiveShimmer(
  el: Element,
  createObserver: (
    cb: (intersecting: boolean) => void
  ) => OffscreenShimmerObserver = defaultOffscreenObserver
): () => void {
  const io = createObserver((intersecting) => {
    el.classList.toggle(LIVE_SHIMMER_PAUSED_CLASS, !intersecting)
  })
  io.observe(el)
  return () => {
    io.disconnect()
    el.classList.remove(LIVE_SHIMMER_PAUSED_CLASS)
  }
}

function defaultOffscreenObserver(
  cb: (intersecting: boolean) => void
): OffscreenShimmerObserver {
  if (typeof IntersectionObserver !== 'function') {
    return { observe: () => undefined, disconnect: () => undefined }
  }
  const io = new IntersectionObserver(
    (entries) => {
      const entry = entries[0]
      if (!entry) return
      cb(entry.isIntersecting)
    },
    { threshold: 0, rootMargin: '48px 0px' }
  )
  return io
}
