/**
 * Appshots 全局自定义热键（Settings → Appshots）。默认 ⌘+⌘ 不能走 globalShortcut。
 * @see electron/main/ARCH.md
 */
import { globalShortcut } from 'electron'
import { appshotChordToAccelerator } from '../../shared/appshot'

let registered: string | null = null

/** 按当前设置注册或卸下全局 Appshots 热键。 */
export function syncAppshotGlobalHotkey(
  raw: unknown,
  onTrigger: () => void
): void {
  const next = appshotChordToAccelerator(raw)
  if (registered === next) return
  if (registered) {
    try {
      globalShortcut.unregister(registered)
    } catch {
      /* ignore */
    }
    registered = null
  }
  if (!next) return
  try {
    const ok = globalShortcut.register(next, onTrigger)
    if (ok) registered = next
  } catch {
    registered = null
  }
}
