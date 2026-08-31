/**
 * 侧栏 Skills 页：浏览各项目已安装 Skill（对标 Codex open Skills in the sidebar）。
 * 说明含官方 `$` 调用、slash 列表、implicit match、SKILL.md 与自动检测。不发明 progressive disclosure。
 * 命令面板 Force reload skills 用 `reloadNonce` 重扫盘上 SKILL.md。
 * @see src/pages/ARCH.md
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { WorkspaceItem } from '../../shared/types'
import { CHATS_SECTION_LABEL } from '../../shared/conversation'
import {
  SKILLS_DETECT_HINT,
  SKILLS_INTRO,
  SKILLS_INVOKE_HINT,
  SKILLS_LABEL,
  SKILLS_MATCH_HINT,
  SKILLS_SKILL_MD_HINT,
  SKILLS_SLASH_HINT
} from '../../shared/reveal-in-folder'
import {
  filterSkillExplorerItems,
  mergeSkillsAcrossProjects,
  type SkillExplorerItem
} from '../../shared/skills-status'
import './SkillsPage.css'

interface Props {
  workspaces: WorkspaceItem[]
  onBack: () => void
  onUseSkill: (name: string) => void
  /** Force reload skills：盘上改过的 Skill 立刻重扫 */
  reloadNonce?: number
}

/** 跨项目浏览 Skill，点选写入 `$name` */
export function SkillsPage({ workspaces, onBack, onUseSkill, reloadNonce }: Props) {
  const [items, setItems] = useState<SkillExplorerItem[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!window.sharker?.listSkills) {
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    const groups: Array<{
      workspaceId: string
      workspaceLabel: string
      skills: Array<{ name: string; description: string }>
    }> = []
    const targets: WorkspaceItem[] = workspaces.length
      ? workspaces
      : [{ id: '', label: '对话', path: '' }]
    for (const ws of targets) {
      try {
        const skills = await window.sharker.listSkills(ws.path || '')
        groups.push({
          workspaceId: ws.id,
          workspaceLabel: ws.label || ws.path || '项目',
          skills
        })
      } catch {
        /* 单个项目失败不挡其它项目 */
      }
    }
    setItems(mergeSkillsAcrossProjects(groups))
    setLoading(false)
  }, [workspaces])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!reloadNonce) return
    void refresh()
  }, [reloadNonce, refresh])

  const visible = useMemo(() => filterSkillExplorerItems(items, query), [items, query])

  return (
    <div className="skills-page view-enter">
      <div className="skills-inner">
        <header className="skills-head">
          <button type="button" className="skills-back" onClick={onBack}>
            ← {CHATS_SECTION_LABEL}
          </button>
          <h1>{SKILLS_LABEL}</h1>
          <p>{SKILLS_INTRO}</p>
          <p>{SKILLS_MATCH_HINT}</p>
          <p>{SKILLS_INVOKE_HINT}</p>
          <p>{SKILLS_SLASH_HINT}</p>
          <p>{SKILLS_SKILL_MD_HINT}</p>
          <p>{SKILLS_DETECT_HINT}</p>
        </header>

        <label className="skills-search">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="按名称、说明或项目过滤"
            aria-label="过滤 Skills"
            autoComplete="off"
          />
        </label>

        {loading ? (
          <p className="skills-empty">加载中…</p>
        ) : visible.length === 0 ? (
          <p className="skills-empty">
            {query.trim() ? `没有匹配「${query.trim()}」的 Skill。` : '当前没有已安装的 Skill。'}
          </p>
        ) : (
          <ul className="skills-list">
            {visible.map((item) => (
              <li key={item.name}>
                <button
                  type="button"
                  className="skills-item glass-tile"
                  onClick={() => onUseSkill(item.name)}
                >
                  <span className="skills-item-name">${item.name}</span>
                  {item.description ? (
                    <span className="skills-item-desc">{item.description}</span>
                  ) : null}
                  <span className="skills-item-projects">
                    {item.workspaces.map((w) => w.label).join(' · ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
