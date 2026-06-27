/**
 * Skill 发现、加载、按用户消息筛选并注入系统提示。
 * @see skills/README.md
 */
import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import os from 'os'
import matter from 'gray-matter'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { SkillInfo } from '../shared/types'

const execFileAsync = promisify(execFile)

/** 全局 Claude Code Skill 目录 ~/.claude/skills（兼容 Claude Code 生态） */
export function getGlobalClaudeSkillsDir(): string {
  return path.join(os.homedir(), '.claude', 'skills')
}

/** 项目级 Claude Code Skill 目录 <workspace>/.claude/skills */
export function getProjectClaudeSkillsDir(workspace: string): string {
  return path.join(workspace, '.claude', 'skills')
}

/** 全局 Sharker Skill 安装目录 ~/.sharker/skills */
export function getGlobalSkillsDir(): string {
  return path.join(os.homedir(), '.sharker', 'skills')
}

/** Sharker 内置 Skill 目录（随应用分发） */
export function getBundledSkillsDir(): string {
  const candidates = [
    path.join(__dirname, 'skills/bundled'),
    path.join(process.cwd(), 'skills/bundled'),
    path.resolve(__dirname, '../../skills/bundled'),
    path.resolve(__dirname, '../../../skills/bundled')
  ]
  for (const dir of candidates) {
    try {
      fsSync.accessSync(dir)
      return dir
    } catch {
      /* try next */
    }
  }
  return candidates[0]
}

/** 项目级 Sharker Skill 目录 <workspace>/.sharker/skills */
export function getProjectSkillsDir(workspace: string): string {
  return path.join(workspace, '.sharker', 'skills')
}

/**
 * 按优先级返回 Skill 搜索目录：先 .claude，后 .sharker；同层内项目优先于全局。
 */
function getSkillSearchDirs(workspace: string): string[] {
  const dirs: string[] = []
  if (workspace) dirs.push(getProjectClaudeSkillsDir(workspace))
  dirs.push(getGlobalClaudeSkillsDir())
  if (workspace) dirs.push(getProjectSkillsDir(workspace))
  dirs.push(getGlobalSkillsDir())
  dirs.push(getBundledSkillsDir())
  return dirs
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

/** 从 .claude 与 .sharker 目录加载全部 Skill；同名时 .claude 优先 */
export async function loadSkills(workspace: string): Promise<SkillInfo[]> {
  const byName = new Map<string, SkillInfo>()

  for (const dir of getSkillSearchDirs(workspace)) {
    const files = await findSkillFiles(dir)
    for (const file of files) {
      const raw = await fs.readFile(file, 'utf8')
      const { data, content } = matter(raw)
      const name = String(data.name ?? path.basename(path.dirname(file)))
      if (byName.has(name)) continue
      byName.set(name, {
        name,
        description: String(data.description ?? ''),
        path: path.dirname(file),
        body: content.trim()
      })
    }
  }

  return [...byName.values()]
}

/** 按用户消息关键词匹配 Skill，最多返回 2 个 */
export function selectSkillsForMessage(skills: SkillInfo[], userMessage: string): SkillInfo[] {
  if (skills.length === 0) return []

  const lower = userMessage.toLowerCase()
  const matched = skills.filter((s) => {
    const desc = s.description.toLowerCase()
    const name = s.name.toLowerCase()
    if (lower.includes(name)) return true
    // 英文长词
    if (
      desc
        .split(/\s+/)
        .filter((w) => w.length > 4)
        .some((w) => lower.includes(w))
    ) {
      return true
    }
    // 中文描述片段（2 字及以上）
    const cjkTokens = s.description.match(/[\u4e00-\u9fff]{2,}/g) ?? []
    if (cjkTokens.some((t) => userMessage.includes(t))) return true
    return false
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
