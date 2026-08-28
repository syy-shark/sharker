/**
 * 自动化任务管理页。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AutomationJob } from '../../shared/automation'
import {
  applyQueueTriageAction,
  sortAutomationQueue,
  unreadQueueCount,
  type AutomationQueueItem,
  type QueueTriageAction
} from '../../shared/automation-queue'
import '../components/settings/SettingsPrimitives.css'
import './AutomationsPage.css'

interface Props {
  onBack: () => void
  onOpenConversation?: (conversationId: string) => void
  onTriage?: (item: AutomationQueueItem, action: QueueTriageAction) => void
}

/** 自动化列表与编辑 */
export function AutomationsPage({ onBack, onOpenConversation, onTriage }: Props) {
  const [jobs, setJobs] = useState<AutomationJob[]>([])
  const [queue, setQueue] = useState<AutomationQueueItem[]>([])
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
    if (window.sharker.listAutomationQueue) {
      setQueue(await window.sharker.listAutomationQueue())
    }
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
          <p>定时任务跑完进入审查队列，不打断当前对话（对标 Codex Triage）</p>
        </header>

        <section className="automations-queue" aria-label="审查队列">
          <h2>
            审查队列
            {unreadQueueCount(queue) > 0 ? (
              <span className="automations-queue-count">{unreadQueueCount(queue)}</span>
            ) : null}
          </h2>
          {queue.length === 0 ? (
            <p className="automations-empty">还没有自动化结果</p>
          ) : (
            <ul className="automations-queue-list">
              {sortAutomationQueue(queue).map((item) => (
                <li key={item.id} className={`automations-queue-item is-${item.status}`}>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{new Date(item.createdAt).toLocaleString()}</p>
                  </div>
                  <div className="automations-queue-actions">
                    {item.status !== 'archived' && onTriage ? (
                      <>
                        <button
                          type="button"
                          className="automations-queue-btn"
                          onClick={() => {
                            const next = applyQueueTriageAction(queue, item.id, 'approve')
                            setQueue(next)
                            void window.sharker.saveAutomationQueue?.(next)
                            onTriage(item, 'approve')
                          }}
                        >
                          接受
                        </button>
                        <button
                          type="button"
                          className="automations-queue-btn"
                          onClick={() => {
                            const next = applyQueueTriageAction(queue, item.id, 'revise')
                            setQueue(next)
                            void window.sharker.saveAutomationQueue?.(next)
                            onTriage(item, 'revise')
                          }}
                        >
                          修订
                        </button>
                        <button
                          type="button"
                          className="automations-queue-btn"
                          onClick={() => {
                            if (!window.confirm(`确定拒绝「${item.title}」并还原该任务改过的文件？`)) return
                            const next = applyQueueTriageAction(queue, item.id, 'reject')
                            setQueue(next)
                            void window.sharker.saveAutomationQueue?.(next)
                            onTriage(item, 'reject')
                          }}
                        >
                          拒绝
                        </button>
                      </>
                    ) : null}
                    {item.conversationId && onOpenConversation ? (
                      <button
                        type="button"
                        className="automations-queue-btn"
                        onClick={() => onOpenConversation(item.conversationId!)}
                      >
                        打开线程
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

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
