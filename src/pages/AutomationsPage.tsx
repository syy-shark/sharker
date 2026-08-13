/**
 * 自动化任务管理页。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AutomationJob } from '../../shared/automation'
import '../components/settings/SettingsPrimitives.css'
import './AutomationsPage.css'

interface Props {
  onBack: () => void
}

/** 自动化列表与编辑 */
export function AutomationsPage({ onBack }: Props) {
  const [jobs, setJobs] = useState<AutomationJob[]>([])
  const [busy, setBusy] = useState(false)
  const jobsRef = useRef<AutomationJob[]>([])

  useEffect(() => {
    jobsRef.current = jobs
  }, [jobs])

  const refresh = useCallback(async () => {
    if (!window.sharker?.listAutomations) return
    const list = await window.sharker.listAutomations()
    jobsRef.current = list
    setJobs(list)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const save = useCallback(async (next: AutomationJob[]) => {
    setBusy(true)
    try {
      await window.sharker.saveAutomations(next)
      jobsRef.current = next
      setJobs(next)
    } finally {
      setBusy(false)
    }
  }, [])

  const updateJob = useCallback((id: string, patch: Partial<AutomationJob>) => {
    const next = jobsRef.current.map((x) => (x.id === id ? { ...x, ...patch } : x))
    jobsRef.current = next
    setJobs(next)
  }, [])

  const persistCurrent = useCallback(() => {
    void save(jobsRef.current)
  }, [save])

  const addJob = async () => {
    const job: AutomationJob = {
      id: crypto.randomUUID(),
      title: '新任务',
      prompt: '每天总结工作区变更',
      cron: '0 9 * * *',
      enabled: true
    }
    await save([...jobsRef.current, job])
  }

  const removeJob = async (id: string) => {
    await save(jobsRef.current.filter((x) => x.id !== id))
  }

  return (
    <div className="automations-page view-enter">
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
                <div className="automation-card-top">
                  <input
                    className="automation-title"
                    value={j.title}
                    onChange={(e) => updateJob(j.id, { title: e.target.value })}
                    onBlur={persistCurrent}
                    aria-label="任务标题"
                  />
                  <button
                    type="button"
                    className="automation-delete"
                    onClick={() => void removeJob(j.id)}
                    disabled={busy}
                    title="删除任务"
                    aria-label="删除任务"
                  >
                    删除
                  </button>
                </div>

                <label className="automation-field">
                  <span>Cron</span>
                  <input
                    value={j.cron}
                    onChange={(e) => updateJob(j.id, { cron: e.target.value })}
                    onBlur={persistCurrent}
                    spellCheck={false}
                  />
                </label>

                <label className="automation-field">
                  <span>提示词</span>
                  <textarea
                    value={j.prompt}
                    rows={3}
                    onChange={(e) => updateJob(j.id, { prompt: e.target.value })}
                    onBlur={persistCurrent}
                  />
                </label>

                <div className="automation-card-footer">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={j.enabled}
                    className={`st-toggle ${j.enabled ? 'st-toggle--on' : ''}`}
                    disabled={busy}
                    onClick={() => {
                      const next = jobsRef.current.map((x) =>
                        x.id === j.id ? { ...x, enabled: !x.enabled } : x
                      )
                      void save(next)
                    }}
                  >
                    <span className="st-toggle-knob" />
                  </button>
                  <span className="automation-toggle-label">{j.enabled ? '已启用' : '已停用'}</span>
                </div>
              </div>
            ))
          )}
        </div>

        <button
          type="button"
          className="automations-add"
          disabled={busy}
          onClick={() => void addJob()}
        >
          {busy ? '保存中…' : '+ 添加自动化'}
        </button>
      </div>
    </div>
  )
}
