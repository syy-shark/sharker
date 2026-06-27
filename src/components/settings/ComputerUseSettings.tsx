/**
 * Computer Use — 开关即配置，无需额外按钮。
 */
import { useCallback, useState } from 'react'
import type { AppSettings } from '../../../shared/types'
import type { ComputerUseStatus } from '../../../shared/computer-use-status'
import { getActiveWorkspacePath } from '../../../shared/workspace'
import { FeatureStatusPanel } from './FeatureStatusPanel'

interface Props {
  draft: AppSettings
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>
  onSave: (next: AppSettings) => Promise<void>
}

function statusLine(status: ComputerUseStatus | null, enabled: boolean, loading: boolean): string {
  if (!enabled) return '已关闭'
  if (loading) return '配置中…'
  if (!status) return '检测中…'
  const main = status.checklist.find((c) => c.id === 'ready') ?? status.checklist[0]
  if (main?.ok || status.builtinReady) return '已就绪'
  return main?.detail ?? '未就绪'
}

/** Computer Use 设置面板 */
export function ComputerUseSettings({ draft, setDraft, onSave }: Props) {
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<ComputerUseStatus | null>(null)
  const enabled = draft.computerUseEnabled ?? true
  const workspace = getActiveWorkspacePath(draft) ?? ''

  const refreshStatus = useCallback(async () => {
    if (!window.sharker?.getComputerUseStatus) return
    setLoading(true)
    try {
      const s = await window.sharker.getComputerUseStatus(workspace)
      setStatus(s)
    } finally {
      setLoading(false)
    }
  }, [workspace])

  const handleToggle = (next: boolean) => {
    const updated = { ...draft, computerUseEnabled: next }
    setDraft(updated)
    setBusy(true)
    setLoading(true)
    void onSave(updated)
      .then(() => refreshStatus())
      .finally(() => setBusy(false))
  }

  return (
    <FeatureStatusPanel
      title="Computer Use"
      description="让 AI 操作桌面应用（点击、输入、读窗口）。"
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
