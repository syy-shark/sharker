/**
 * Browser Use — 开关即配置。
 */
import { useCallback, useState } from 'react'
import type { AppSettings } from '../../../shared/types'
import type { BrowserUseStatus } from '../../../shared/browser-use-status'
import { getActiveWorkspacePath } from '../../../shared/workspace'
import { FeatureStatusPanel } from './FeatureStatusPanel'

interface Props {
  draft: AppSettings
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>
  onSave: (next: AppSettings) => Promise<void>
}

function statusLine(status: BrowserUseStatus | null, enabled: boolean, loading: boolean): string {
  if (!enabled) return '已关闭'
  if (loading) return '配置中…'
  if (!status) return '检测中…'
  if (status.mcpPlaywrightConfigured || status.playwrightAvailable) return '已就绪'
  return 'Playwright 安装中或首次使用会稍慢'
}

/** Browser Use 设置面板 */
export function BrowserUseSettings({ draft, setDraft, onSave }: Props) {
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<BrowserUseStatus | null>(null)
  const enabled = draft.browserUseEnabled ?? true
  const workspace = getActiveWorkspacePath(draft) ?? ''

  const refreshStatus = useCallback(async () => {
    if (!window.sharker?.getBrowserUseStatus) return
    setLoading(true)
    try {
      const s = await window.sharker.getBrowserUseStatus(workspace)
      setStatus(s)
    } finally {
      setLoading(false)
    }
  }, [workspace])

  const handleToggle = (next: boolean) => {
    const updated = { ...draft, browserUseEnabled: next }
    setDraft(updated)
    setBusy(true)
    setLoading(true)
    void onSave(updated)
      .then(() => refreshStatus())
      .finally(() => setBusy(false))
  }

  return (
    <FeatureStatusPanel
      title="Browser Use"
      description="让 AI 控制浏览器：打开页面、点击、填表。"
      enabled={enabled}
      onToggle={handleToggle}
      busy={busy}
      checklist={status?.checklist ?? []}
      showChecklist={false}
      toggleDescription={statusLine(status, enabled, busy || loading)}
      onRefresh={refreshStatus}
    />
  )
}
