/**
 * Skill 发现、加载、按用户消息筛选并注入系统提示。
 * @see skills/README.md
 */
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import matter from 'gray-matter'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { SkillInfo } from '../shared/types'

const execFileAsync = promisify(execFile)

/** 全局 Skill 安装目录 ~/.sharker/skills */
export function getGlobalSkillsDir(): string {
  return path.join(os.homedir(), '.sharker', 'skills')
}

/** 项目级 Skill 目录 <workspace>/.sharker/skills */
export function getProjectSkillsDir(workspace: string): string {
  return path.join(workspace, '.sharker', 'skills')
}

/** 递归查找目录下所有 SKILL.md 文件路径 */
async function findSkillFiles(dir: string): Promise<string[]> {
  const results: string[] = []
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        const skillMd = path.join(full, 'SKILL.md')
        try {
          await fs.access(skillMd)
          results.push(skillMd)
        } catch {
          results.push(...(await findSkillFiles(full)))
        }
      }
    }
  } catch {
    /* missing dir */
  }
  return results
}

/** 从全局与项目目录加载全部 Skill 元数据与正文 */
export async function loadSkills(workspace: string): Promise<SkillInfo[]> {
  const dirs = [getGlobalSkillsDir()]
  if (workspace) dirs.push(getProjectSkillsDir(workspace))

  const files = new Set<string>()
  for (const d of dirs) {
    const found = await findSkillFiles(d)
    found.forEach((f) => files.add(f))
  }

  const skills: SkillInfo[] = []
  for (const file of files) {
    const raw = await fs.readFile(file, 'utf8')
    const { data, content } = matter(raw)
    skills.push({
      name: String(data.name ?? path.basename(path.dirname(file))),
      description: String(data.description ?? ''),
      path: path.dirname(file),
      body: content.trim()
    })
  }
  return skills
}

/** 按用户消息关键词匹配 Skill，最多返回 2 个 */
export function selectSkillsForMessage(skills: SkillInfo[], userMessage: string): SkillInfo[] {
  if (skills.length === 0) return []

  const lower = userMessage.toLowerCase()
  const matched = skills.filter((s) => {
    const desc = s.description.toLowerCase()
    const name = s.name.toLowerCase()
    return (
      lower.includes(name) ||
      desc
        .split(/\s+/)
        .filter((w) => w.length > 4)
        .some((w) => lower.includes(w))
    )
  })

  return matched.slice(0, 2)
}

/** 将匹配到的 Skill 拼成系统提示片段 */
export function buildSkillsSystemPrompt(skills: SkillInfo[], userMessage: string): string {
  const selected = selectSkillsForMessage(skills, userMessage)
  if (selected.length === 0) return ''

  return selected
    .map((s) => `## Skill: ${s.name}\n${s.description}\n\n${s.body}`)
    .join('\n\n---\n\n')
}

/** 克隆或更新 Skill 仓库到全局目录 */
export async function cloneSkillRepo(repoUrl: string): Promise<string> {
  const dir = getGlobalSkillsDir()
  await fs.mkdir(dir, { recursive: true })
  const name = repoUrl.replace(/[^a-zA-Z0-9_-]/g, '_').slice(-40)
  const target = path.join(dir, name)
  try {
    await fs.access(target)
    await execFileAsync('git', ['-C', target, 'pull'], { timeout: 120_000 })
  } catch {
    await execFileAsync('git', ['clone', '--depth', '1', repoUrl, target], {
      timeout: 120_000
    })
  }
  return target
}
