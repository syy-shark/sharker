/**
 * 右侧子 Agent 活动（对标 Codex Activity / Subagents）。
 * @see ./ARCH.md
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  filterSubAgentsForParent,
  sortSubAgents,
  subAgentTitle,
  type SubAgentSnapshot
} from '../../../shared/subagent'
import './AgentsPanel.css'

interface Props {
  conversationId: string | null
  /** 主线程时间线点开时选中该孩子 */
  focusId?: string | null
}

export function AgentsPanel({ conversationId, focusId = null }: Props) {
  const [items, setItems] = useState<SubAgentSnapshot[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [steer, setSteer] = useState('')
  const [acting, setActing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!window.sharker.listSubAgents) {
      setItems([])
      return
    }
    const next = await window.sharker.listSubAgents(conversationId || '')
    setItems(next)
  }, [conversationId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (focusId) setSelectedId(focusId)
  }, [focusId])

  useEffect(() => {
    if (!window.sharker.onSubAgentUpdate) return
    return window.sharker.onSubAgentUpdate((snap) => {
      setItems((prev) => {
        const filtered =
          conversationId && snap.parentConversationId !== conversationId
            ? prev
            : prev.some((s) => s.id === snap.id)
              ? prev.map((s) => (s.id === snap.id ? snap : s))
              : conversationId && snap.parentConversationId === conversationId
                ? [...prev, snap]
                : prev
        return filtered
      })
    })
  }, [conversationId])

  const visible = useMemo(
    () => sortSubAgents(filterSubAgentsForParent(items, conversationId)),
    [items, conversationId]
  )
  const selected = visible.find((s) => s.id === selectedId) ?? visible[0] ?? null
  const active = visible.filter((s) => s.status === 'running')
  const done = visible.filter((s) => s.status !== 'running')

  const runSteer = async () => {
    if (!selected || !steer.trim() || !window.sharker.steerSubAgent) return
    setActing(true)
    setError(null)
    try {
      const result = await window.sharker.steerSubAgent(selected.id, steer.trim())
      if (!result.ok) setError(result.error)
      else setSteer('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setActing(false)
    }
  }

  return (
    <div className="agents-panel">
      <div className="agents-panel__head">
        <span className="agents-panel__title">子 Agent</span>
        <span className="agents-panel__count">
          {active.length} 进行中 · {done.length} 已结束
        </span>
      </div>
      {error ? <p className="agents-panel__error">{error}</p> : null}
      {!visible.length ? (
        <p className="agents-panel__empty">当前线程还没有子 Agent。让助手并行委派任务后会出现在这里。</p>
      ) : (
        <ul className="agents-panel__list">
          {visible.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className={`agents-panel__item${selected?.id === s.id ? ' is-active' : ''}`}
                onClick={() => setSelectedId(s.id)}
              >
                <span className={`agents-panel__status agents-panel__status--${s.status}`}>
                  {s.status === 'running' ? '进行中' : s.status === 'failed' ? '失败' : '完成'}
                </span>
                <span className="agents-panel__item-title">{subAgentTitle(s.prompt)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected ? (
        <div className="agents-panel__detail">
          <div className="agents-panel__detail-head">
            <code>{selected.id}</code>
            {selected.status === 'running' && window.sharker.stopSubAgent ? (
              <button
                type="button"
                className="agents-panel__action"
                disabled={acting}
                onClick={() => void window.sharker.stopSubAgent(selected.id)}
              >
                停止
              </button>
            ) : null}
          </div>
          <pre className="agents-panel__transcript">
            {selected.streaming || selected.result || '（等待输出）'}
          </pre>
          <form
            className="agents-panel__steer"
            onSubmit={(e) => {
              e.preventDefault()
              void runSteer()
            }}
          >
            <input
              className="agents-panel__steer-input"
              value={steer}
              placeholder="转向：给这个子 Agent 追加指令"
              aria-label="转向子 Agent"
              disabled={acting}
              onChange={(e) => setSteer(e.target.value)}
            />
            <button type="submit" className="agents-panel__action" disabled={acting || !steer.trim()}>
              转向
            </button>
          </form>
        </div>
      ) : null}
    </div>
  )
}
