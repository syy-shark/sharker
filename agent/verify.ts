/**
 * 代码修改后的自动验证：根据 package.json scripts 选择 npm run 命令。
 * @see agent/README.md
 */
import fs from 'fs/promises'
import path from 'path'

const VERIFY_SCRIPT_ORDER = ['test', 'build', 'lint', 'check', 'typecheck'] as const

/** 用户明确要求跳过时，不触发自动验证 */
export function shouldSkipAutoVerify(userText: string): boolean {
  return /不要运行|别运行|无需运行|skip run|no run/i.test(userText)
}

/** 按优先级从 package.json scripts 选取 npm run 验证命令 */
export async function pickVerifyCommand(workspace: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(path.join(workspace, 'package.json'), 'utf8')
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string> }
    const scripts = pkg.scripts ?? {}
    for (const key of VERIFY_SCRIPT_ORDER) {
      if (scripts[key]) return `npm run ${key}`
    }
  } catch {
    /* no package.json */
  }
  return null
}
