/**
 * `/skills` 已安装 Skill 列表文案。
 * @see shared/ARCH.md
 */

export interface SkillStatusItem {
  name: string
  description: string
}

/** Markdown 目录；可选按名称过滤 */
export function formatSkillsStatus(items: SkillStatusItem[], query = ''): string {
  const q = query.trim().toLowerCase()
  const list = q
    ? items.filter(
        (s) =>
          s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
      )
    : items
  const lines = [
    '**Skills**（对标 Codex `/skills`）',
    '',
    '输入 `$技能名` 引用。用法：`/skills [过滤]`',
    ''
  ]
  if (list.length === 0) {
    lines.push(q ? `没有匹配 \`${query.trim()}\` 的 Skill。` : '当前没有已安装的 Skill。')
    return lines.join('\n')
  }
  for (const s of list.slice(0, 40)) {
    const desc = (s.description || '').replace(/\s+/g, ' ').trim().slice(0, 120)
    lines.push(`- \`$${s.name}\`${desc ? ` — ${desc}` : ''}`)
  }
  return lines.join('\n')
}

/** 侧栏 Skills 页：同一 Skill 跨项目合并，带上来源工作区 */
export type SkillExplorerItem = {
  name: string
  description: string
  workspaces: Array<{ id: string; label: string }>
}

export function mergeSkillsAcrossProjects(
  groups: Array<{ workspaceId: string; workspaceLabel: string; skills: SkillStatusItem[] }>
): SkillExplorerItem[] {
  const byName = new Map<string, SkillExplorerItem>()
  for (const group of groups) {
    const label = group.workspaceLabel.trim() || group.workspaceId
    for (const skill of group.skills) {
      const name = String(skill.name || '').trim()
      if (!name) continue
      const cur = byName.get(name)
      if (!cur) {
        byName.set(name, {
          name,
          description: skill.description || '',
          workspaces: [{ id: group.workspaceId, label }]
        })
        continue
      }
      if (!cur.description && skill.description) cur.description = skill.description
      if (!cur.workspaces.some((w) => w.id === group.workspaceId)) {
        cur.workspaces.push({ id: group.workspaceId, label })
      }
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh'))
}

/** 侧栏 Skills 页过滤：名称 / 说明 / 项目名 */
export function filterSkillExplorerItems(
  items: SkillExplorerItem[],
  query: string
): SkillExplorerItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter(
    (item) =>
      item.name.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.workspaces.some((w) => w.label.toLowerCase().includes(q))
  )
}
