/**
 * 工具执行器：按工具名将模型参数分发到文件、终端、Git 等实际操作。
 * @see tools/README.md
 */
import fs from 'fs/promises'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { runShellCommand } from './shell-runner'
import type { AppSettings, ToolRunResult } from '../shared/types'
import { buildFileDiff, formatEditSummary, formatWriteSummary } from '../shared/line-diff'
import { getActiveWorkspacePath } from '../shared/workspace'
import { checkPathAccess, normalizePath, resolveCommandCwd } from './permissions'
import { truncateLines, truncateToolOutput } from './truncate'

const execFileAsync = promisify(execFile)

const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'out', '.cache'])

/** 递归列出目录树，跳过常见忽略目录 */
async function listDirRecursive(dir: string, depth: number, maxDepth: number): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const lines: string[] = []
  for (const e of entries) {
    if (IGNORE_DIRS.has(e.name)) continue
    const full = path.join(dir, e.name)
    const prefix = '  '.repeat(depth)
    lines.push(`${prefix}${e.name}${e.isDirectory() ? '/' : ''}`)
    if (e.isDirectory() && depth < maxDepth) {
      lines.push(...(await listDirRecursive(full, depth + 1, maxDepth)))
    }
  }
  return lines
}

/** 将简单 glob（*、**、?）转为正则，用于文件名匹配 */
function matchGlob(name: string, pattern: string): boolean {
  const re = new RegExp(
    '^' +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '<<<GLOBSTAR>>>')
        .replace(/\*/g, '[^/]*')
        .replace(/<<<GLOBSTAR>>>/g, '.*')
        .replace(/\?/g, '.') +
      '$'
  )
  return re.test(name)
}

/** 深度优先遍历目录，将 basename 匹配 glob 的文件路径收集到 results */
async function walkGlob(dir: string, pattern: string, results: string[], depth = 0): Promise<void> {
  if (depth > 12) return
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (IGNORE_DIRS.has(e.name)) continue
    const full = path.join(dir, e.name)
    const rel = path.relative(dir, full)
    if (e.isFile() && matchGlob(path.basename(full), pattern)) {
      results.push(full)
    }
    if (e.isDirectory()) {
      await walkGlob(full, pattern, results, depth + 1)
    }
  }
}

/** 在目录下按正则搜索文本，跳过过大文件，最多 200 条 */
async function grepDir(
  dir: string,
  pattern: string,
  fileGlob?: string
): Promise<string[]> {
  const results: string[] = []
  const re = new RegExp(pattern, 'i')

  async function walk(d: string, depth = 0): Promise<void> {
    if (depth > 12) return
    let entries
    try {
      entries = await fs.readdir(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (IGNORE_DIRS.has(e.name)) continue
      const full = path.join(d, e.name)
      if (e.isDirectory()) {
        await walk(full, depth + 1)
      } else if (e.isFile()) {
        if (fileGlob && !matchGlob(e.name, fileGlob)) continue
        try {
          const stat = await fs.stat(full)
          if (stat.size > 512_000) continue
          const content = await fs.readFile(full, 'utf8')
          const lines = content.split('\n')
          lines.forEach((line, i) => {
            if (re.test(line)) results.push(`${full}:${i + 1}: ${line.trim()}`)
          })
        } catch {
          /* skip binary */
        }
      }
    }
  }

  await walk(dir)
  return results.slice(0, 200)
}

/** 沙箱模式下校验目标路径，不通过则抛错 */
function assertAccess(settings: AppSettings, target: string): void {
  const check = checkPathAccess(target, getActiveWorkspacePath(settings), settings.permissionMode)
  if (!check.allowed) throw new Error(check.reason ?? 'Access denied')
}

/** 解析工具 cwd 参数，回落到工作区根 */
function toolCwd(settings: AppSettings, cwd: unknown): string {
  const ws = getActiveWorkspacePath(settings)
  return resolveCommandCwd(cwd != null ? String(cwd) : undefined, ws, settings.permissionMode)
}

/** 在工作区目录执行 git 子命令 */
async function runGit(cwd: string, args: string[]): Promise<string> {
  const { stdout, stderr } = await execFileAsync('git', args, {
    cwd,
    maxBuffer: 4 * 1024 * 1024,
    timeout: 120_000
  })
  return (stdout || stderr || '').trim()
}

/** 读文本文件；不存在返回 null */
async function readTextFileOrNull(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, 'utf8')
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    if (err.code === 'ENOENT') return null
    throw e
  }
}

/** 工具名 → 具体实现的 switch 分发，执行前经 assertAccess 校验路径 */
async function runTool(
  name: string,
  args: Record<string, unknown>,
  settings: AppSettings,
  signal?: AbortSignal
): Promise<ToolRunResult> {
  const wrap = (output: string, fileDiff?: ToolRunResult['fileDiff']): ToolRunResult => ({
    output,
    fileDiff
  })

  switch (name) {
    /* —— 文件与目录 —— */
    case 'list_dir': {
      const p = normalizePath(String(args.path))
      assertAccess(settings, p)
      const maxDepth = Number(args.depth ?? 1)
      const lines = await listDirRecursive(p, 0, Math.max(0, maxDepth))
      return wrap(lines.join('\n') || '(empty)')
    }
    case 'glob_file_search': {
      const cwd = toolCwd(settings, args.cwd)
      assertAccess(settings, cwd)
      const pattern = String(args.pattern)
      const results: string[] = []
      await walkGlob(cwd, pattern, results)
      return wrap(results.slice(0, 100).join('\n') || '(no matches)')
    }
    case 'grep': {
      const p = normalizePath(String(args.path))
      assertAccess(settings, p)
      const hits = await grepDir(p, String(args.pattern), args.glob ? String(args.glob) : undefined)
      return wrap(hits.length ? truncateLines(hits, 200) : '(no matches)')
    }
    case 'read_file': {
      const p = normalizePath(String(args.path))
      assertAccess(settings, p)
      const content = await fs.readFile(p, 'utf8')
      const lines = content.split('\n')
      const offset = Number(args.offset ?? 1) - 1
      const limit = args.limit ? Number(args.limit) : lines.length
      return wrap(lines.slice(offset, offset + limit).join('\n'))
    }
    case 'write_file': {
      const p = normalizePath(String(args.path))
      assertAccess(settings, p)
      const newContent = String(args.content)
      const oldText = await readTextFileOrNull(p)
      await fs.mkdir(path.dirname(p), { recursive: true })
      await fs.writeFile(p, newContent, 'utf8')
      const fileDiff = buildFileDiff(p, oldText, newContent)
      return wrap(formatWriteSummary(p, oldText === null, fileDiff.stats), fileDiff)
    }
    case 'search_replace': {
      const p = normalizePath(String(args.path))
      assertAccess(settings, p)
      const oldStr = String(args.old_string)
      const newStr = String(args.new_string)
      const content = await fs.readFile(p, 'utf8')
      const replaceAll = Boolean(args.replace_all)
      if (!content.includes(oldStr)) throw new Error('old_string not found')
      const next = replaceAll
        ? content.split(oldStr).join(newStr)
        : content.replace(oldStr, newStr)
      await fs.writeFile(p, next, 'utf8')
      const fileDiff = buildFileDiff(p, content, next)
      return wrap(formatEditSummary(p, fileDiff.stats), fileDiff)
    }
    case 'delete_path': {
      const p = normalizePath(String(args.path))
      assertAccess(settings, p)
      const recursive = Boolean(args.recursive)
      const stat = await fs.stat(p)
      if (stat.isDirectory()) {
        await fs.rm(p, { recursive, force: true })
      } else {
        await fs.unlink(p)
      }
      return wrap(`Deleted ${p}`)
    }
    case 'move_path': {
      const src = normalizePath(String(args.source))
      const dest = normalizePath(String(args.destination))
      assertAccess(settings, src)
      assertAccess(settings, dest)
      await fs.mkdir(path.dirname(dest), { recursive: true })
      await fs.rename(src, dest)
      return wrap(`Moved ${src} -> ${dest}`)
    }
    case 'create_directory': {
      const p = normalizePath(String(args.path))
      assertAccess(settings, p)
      await fs.mkdir(p, { recursive: Boolean(args.recursive ?? true) })
      return wrap(`Created ${p}`)
    }
    /* —— 终端 —— */
    case 'run_terminal_cmd': {
      const cwd = toolCwd(settings, args.cwd)
      assertAccess(settings, cwd)
      const command = String(args.command)
      const blockUntilMs =
        args.block_until_ms != null ? Number(args.block_until_ms) : undefined
      return wrap(await runShellCommand(command, cwd, { blockUntilMs, signal }))
    }
    /* —— Git —— */
    case 'git_status': {
      const cwd = toolCwd(settings, args.cwd)
      assertAccess(settings, cwd)
      return wrap(await runGit(cwd, ['status', '--short', '--branch']))
    }
    case 'git_diff': {
      const cwd = toolCwd(settings, args.cwd)
      assertAccess(settings, cwd)
      const gitArgs = ['diff']
      if (args.staged) gitArgs.push('--staged')
      if (args.path) gitArgs.push('--', String(args.path))
      return wrap(await runGit(cwd, gitArgs))
    }
    case 'git_log': {
      const cwd = toolCwd(settings, args.cwd)
      assertAccess(settings, cwd)
      return wrap(
        await runGit(cwd, [
          'log',
          `--max-count=${args.limit ?? 20}`,
          '--oneline',
          '--decorate'
        ])
      )
    }
    case 'git_show': {
      const cwd = toolCwd(settings, args.cwd)
      assertAccess(settings, cwd)
      return wrap(await runGit(cwd, ['show', String(args.ref), '--stat']))
    }
    case 'git_add': {
      const cwd = toolCwd(settings, args.cwd)
      assertAccess(settings, cwd)
      return wrap(await runGit(cwd, ['add', ...(args.paths as string[])]))
    }
    case 'git_commit': {
      const cwd = toolCwd(settings, args.cwd)
      assertAccess(settings, cwd)
      return wrap(await runGit(cwd, ['commit', '-m', String(args.message)]))
    }
    case 'git_pull': {
      const cwd = toolCwd(settings, args.cwd)
      assertAccess(settings, cwd)
      return wrap(await runGit(cwd, ['pull']))
    }
    case 'git_push': {
      const cwd = toolCwd(settings, args.cwd)
      assertAccess(settings, cwd)
      return wrap(await runGit(cwd, ['push']))
    }
    /* —— Skill 脚本 —— */
    case 'run_skill_script': {
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
      return wrap([stdout, stderr].filter(Boolean).join('\n') || '(done)')
    }
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

/** 对外入口：执行工具并返回输出与可选 diff 元数据 */
export async function executeToolWithMeta(
  name: string,
  args: Record<string, unknown>,
  settings: AppSettings,
  signal?: AbortSignal
): Promise<ToolRunResult> {
  const result = await runTool(name, args, settings, signal)
  return {
    output: truncateToolOutput(result.output),
    fileDiff: result.fileDiff
  }
}

/** 对外入口：执行工具并截断过长输出；signal 用于中止长驻终端命令 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  settings: AppSettings,
  signal?: AbortSignal
): Promise<string> {
  return (await executeToolWithMeta(name, args, settings, signal)).output
}
