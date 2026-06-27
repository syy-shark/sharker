/**
 * 输入框斜杠命令补全菜单。
 */
import { useEffect, useMemo, useRef } from 'react'
import {
  SLASH_COMMAND_CATEGORIES,
  filterSlashCommands,
  type SlashCommandCategory,
  type SlashCommandMeta
} from '../../shared/slash-commands'
import './SlashCommandMenu.css'

interface Props {
  query: string
  activeIndex: number
  onSelect: (cmd: SlashCommandMeta) => void
  onActiveIndexChange: (index: number) => void
}

/** `/` 触发的命令选择器 */
export function SlashCommandMenu({
  query,
  activeIndex,
  onSelect,
  onActiveIndexChange
}: Props) {
  const listRef = useRef<HTMLUListElement>(null)
  const filtered = useMemo(() => filterSlashCommands(query), [query])

  const grouped = useMemo(() => {
    const map = new Map<SlashCommandCategory, SlashCommandMeta[]>()
    for (const c of filtered) {
      const list = map.get(c.category) ?? []
      list.push(c)
      map.set(c.category, list)
    }
    return [...map.entries()].sort(
      (a, b) =>
        SLASH_COMMAND_CATEGORIES[a[0]].order - SLASH_COMMAND_CATEGORIES[b[0]].order
    )
  }, [filtered])

  const flat = useMemo(() => filtered, [filtered])

  useEffect(() => {
    if (activeIndex >= flat.length) onActiveIndexChange(Math.max(0, flat.length - 1))
  }, [activeIndex, flat.length, onActiveIndexChange])

  useEffect(() => {
    const el = listRef.current?.querySelector('.slash-menu-item.active')
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (!flat.length) {
    return (
      <div className="slash-menu slash-menu--empty">
        <p>无匹配命令</p>
      </div>
    )
  }

  let globalIdx = -1

  return (
    <div className="slash-menu" role="listbox" aria-label="斜杠命令">
      <ul ref={listRef} className="slash-menu-list">
        {grouped.map(([cat, items]) => (
          <li key={cat} className="slash-menu-group">
            <div className="slash-menu-group-label">{SLASH_COMMAND_CATEGORIES[cat].label}</div>
            <ul>
              {items.map((cmd) => {
                globalIdx += 1
                const idx = globalIdx
                return (
                  <li key={cmd.name}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={idx === activeIndex}
                      className={`slash-menu-item ${idx === activeIndex ? 'active' : ''}`}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        onSelect(cmd)
                      }}
                      onMouseEnter={() => onActiveIndexChange(idx)}
                    >
                      <span className="slash-menu-name">/{cmd.name}</span>
                      <span className="slash-menu-desc">{cmd.description}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** 判断输入是否应显示斜杠菜单 */
export function shouldShowSlashMenu(input: string): { show: boolean; query: string } {
  const trimmed = input
  if (!trimmed.startsWith('/')) return { show: false, query: '' }
  const rest = trimmed.slice(1)
  if (rest.includes('\n')) return { show: false, query: '' }
  if (/\s{2,}/.test(rest)) return { show: false, query: '' }
  const spaceIdx = rest.indexOf(' ')
  if (spaceIdx >= 0) return { show: false, query: '' }
  return { show: true, query: rest }
}
