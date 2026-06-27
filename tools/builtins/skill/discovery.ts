/**
 * Skill 发现：list_skills / read_skill。
 * @see tools/README.md
 */
import fs from 'fs/promises'
import path from 'path'
import { loadSkills } from '../../../skills/loader'
import { getActiveWorkspacePath } from '../../../shared/workspace'
import { ok } from '../../context'
import type { ToolHandler } from '../../types'

export const listSkillsTool: ToolHandler = {
  name: 'list_skills',
  title: '列出技能',
  async execute(_args, ctx) {
    const ws = getActiveWorkspacePath(ctx.settings)
    const skills = await loadSkills(ws)
    if (!skills.length) return ok('(no skills installed)')
    return ok(
      skills.map((s) => `- ${s.name}: ${s.description}\n  path: ${s.path}`).join('\n')
    )
  }
}

export const readSkillTool: ToolHandler = {
  name: 'read_skill',
  title: '读取技能',
  async execute(args, ctx) {
    const ws = getActiveWorkspacePath(ctx.settings)
    const name = String(args.name)
    const skills = await loadSkills(ws)
    const skill = skills.find((s) => s.name === name)
    if (!skill) throw new Error(`Skill not found: ${name}`)
    const md = await fs.readFile(path.join(skill.path, 'SKILL.md'), 'utf8').catch(() => skill.body)
    return ok(`# Skill: ${skill.name}\n${skill.description}\n\n${md}`)
  }
}

export const skillDiscoveryTools: ToolHandler[] = [listSkillsTool, readSkillTool]
