/**
 * 自动化任务管理页。
 */
import { useCallback, useEffect, useState } from 'react'
import type { AutomationJob } from '../../shared/automation'
import './AutomationsPage.css'

interface Props {
  onBack: () => void
}

/** 自动化列表与编辑 */
export function AutomationsPage({ onBack }: Props) {
  const [jobs, setJobs] = useState<AutomationJob[]>([])
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!window.sharker?.listAutomations) return
    setJobs(await window.sharker.listAutomations())
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const addJob = async () => {
    const job: AutomationJob = {
      id: crypto.randomUUID(),
      title: '新任务',
      prompt: '每天总结工作区变更',
      cron: '0 9 * * *',
      enabled: true
    }
    const next = [...jobs, job]
    setBusy(true)
    await window.sharker.saveAutomations(next)
    setJobs(next)
    setBusy(false)
  }

  const save = async (next: AutomationJob[]) => {
    setBusy(true)
    await window.sharker.saveAutomations(next)
    setJobs(next)
    setBusy(false)
  }

  return (
    <div className="automations-page">
      <div className="automations-inner">
      <header className="automations-head">
        <button type="button" className="automations-back" onClick={onBack}>
          ← 返回
        </button>
        <h1>自动化</h1>
        <p>定时向 Agent 派发任务（cron：分 时 日 月 周）</p>
      </header>
      <div className="automations-list">
        {jobs.length === 0 ? (
          <p className="automations-empty">还没有自动化任务</p>
        ) : (
          jobs.map((j) => (
            <div key={j.id} className="automation-card">
              <input
                className="automation-title"
                value={j.title}
                onChange={(e) => {
                  const next = jobs.map((x) =>
                    x.id === j.id ? { ...x, title: e.target.value } : x
                  )
                  setJobs(next)
                }}
                onBlur={() => void save(jobs)}
              />
              <label className="automation-field">
                <span>Cron</span>
                <input
                  value={j.cron}
                  onChange={(e) => {
                    const next = jobs.map((x) =>
                      x.id === j.id ? { ...x, cron: e.target.value } : x
                    )
                    setJobs(next)
                  }}
                  onBlur={() => void save(jobs)}
                />
              </label>
              <label className="automation-field">
                <span>提示词</span>
                <textarea
                  value={j.prompt}
                  rows={3}
                  onChange={(e) => {
                    const next = jobs.map((x) =>
                      x.id === j.id ? { ...x, prompt: e.target.value } : x
                    )
                    setJobs(next)
                  }}
                  onBlur={() => void save(jobs)}
                />
              </label>
              <label className="automation-toggle">
                <input
                  type="checkbox"
                  checked={j.enabled}
                  onChange={(e) => {
                    const next = jobs.map((x) =>
                      x.id === j.id ? { ...x, enabled: e.target.checked } : x
                    )
                    void save(next)
                  }}
                />
                启用
              </label>
            </div>
          ))
        )}
      </div>
      <button type="button" className="automations-add" disabled={busy} onClick={() => void addJob()}>
        + 添加自动化
      </button>
      </div>
    </div>
  )
}
