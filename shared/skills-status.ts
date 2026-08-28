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
