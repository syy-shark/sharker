/**
 * Git 子进程执行封装。
 * @see tools/ARCH.md
 */
import { execFile, spawn } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

/** 在工作区目录执行 git 子命令；`input` 走 stdin（hunk apply） */
export async function runGit(
  cwd: string,
  args: string[],
  options: { trim?: boolean; input?: string } = {}
): Promise<string> {
  const out =
    options.input != null
      ? await runGitWithStdin(cwd, args, options.input)
      : await runGitExec(cwd, args)
  return options.trim === false ? out : out.trim()
}

async function runGitExec(cwd: string, args: string[]): Promise<string> {
  const { stdout, stderr } = await execFileAsync('git', args, {
    cwd,
    maxBuffer: 4 * 1024 * 1024,
    timeout: 120_000
  })
  return stdout || stderr || ''
}

function runGitWithStdin(cwd: string, args: string[], input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`git ${args[0] ?? ''} timed out`))
    }, 30_000)
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      const out = stdout || stderr || ''
      if (code === 0) resolve(out)
      else reject(new Error(stderr.trim() || out.trim() || `git ${args.join(' ')} failed (${code})`))
    })
    child.stdin.end(input)
  })
}
