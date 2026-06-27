/**
 * run_skill_script：执行 Skill 目录下的脚本。
 * @see tools/README.md
 */
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { ok } from '../context'
import { normalizePath } from '../permissions'
import type { ToolHandler } from '../types'

const execFileAsync = promisify(execFile)

export const runSkillScriptTool: ToolHandler = {
  name: 'run_skill_script',
  title: '运行技能',
  assessRisk: () => ({ highRisk: true, reason: '执行 Skill 脚本' }),
  async execute(args) {
    const skillPath = normalizePath(String(args.skillPath))
    const script = String(args.script)
    const scriptPath = path.join(skillPath, 'scripts', script)
    if (!scriptPath.startsWith(path.join(skillPath, 'scripts'))) {
      throw new Error('Invalid script path')
    }
    const extra = (args.args as string[]) ?? []
    const { stdout, stderr } = await execFileAsync(scriptPath, extra, {
      cwd: skillPath,
      maxBuffer: 4 * 1024 * 1024,
      timeout: 300_000
    })
    return ok([stdout, stderr].filter(Boolean).join('\n') || '(done)')
  }
}
