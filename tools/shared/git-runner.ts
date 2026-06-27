/**
 * Git 子进程执行封装。
 * @see tools/README.md
 */
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

/** 在工作区目录执行 git 子命令 */
export async function runGit(cwd: string, args: string[]): Promise<string> {
  const { stdout, stderr } = await execFileAsync('git', args, {
    cwd,
    maxBuffer: 4 * 1024 * 1024,
    timeout: 120_000
  })
  return (stdout || stderr || '').trim()
}
