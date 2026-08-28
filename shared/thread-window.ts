/**
 * 弹出线程窗路由（对标 Codex Open in Popup Window）。
 * @see shared/ARCH.md
 */

export interface ThreadWindowRoute {
  workspaceId: string
  conversationId: string
}

/** `#thread/<workspaceId>/<conversationId>` */
export function parseThreadWindowHash(hash: string): ThreadWindowRoute | null {
  const raw = String(hash || '').trim()
  const m = /^#thread\/([^/]+)\/([^/?#]+)/.exec(raw)
  if (!m?.[1] || !m[2]) return null
  try {
    const workspaceId = decodeURIComponent(m[1])
    const conversationId = decodeURIComponent(m[2])
    if (!workspaceId || !conversationId) return null
    return { workspaceId, conversationId }
  } catch {
    return null
  }
}

export function formatThreadWindowHash(workspaceId: string, conversationId: string): string {
  return `#thread/${encodeURIComponent(workspaceId)}/${encodeURIComponent(conversationId)}`
}
