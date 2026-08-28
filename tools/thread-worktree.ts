/**
 * 为会话准备隔离 Git worktree（对标 Codex 桌面端 Worktree 线程）。
 * @see tools/ARCH.md
 */
import { mkdir } from 'fs/promises'
import os from 'os'
import path from 'path'
import { runGit } from './shared/git-runner'

export type PrepareWorktreeResult =
  | { ok: true; path: string; branch: string }
  | { ok: false; error: string }

function shortId(conversationId: string): string {
  return conversationId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'thread'
}

/** 在 ~/.sharker/worktrees 下为会话创建或复用 detached worktree */
export async function prepareThreadWorktree(options: {
  workspacePath: string
  conversationId: string
}): Promise<PrepareWorktreeResult> {
  const cwd = path.resolve(options.workspacePath)
  try {
    const inside = await runGit(cwd, ['rev-parse', '--is-inside-work-tree'])
    if (inside.trim() !== 'true') {
      return { ok: false, error: '当前工作区不是 git 仓库，无法使用隔离 Worktree' }
    }
  } catch {
    return { ok: false, error: '当前工作区不是 git 仓库，无法使用隔离 Worktree' }
  }

  let repoName = path.basename(cwd)
  try {
    const toplevel = (await runGit(cwd, ['rev-parse', '--show-toplevel'])).trim()
    if (toplevel) repoName = path.basename(toplevel)
  } catch {
    /* keep basename */
  }

  const dest = path.join(os.homedir(), '.sharker', 'worktrees', `${repoName}-${shortId(options.conversationId)}`)
  await mkdir(path.dirname(dest), { recursive: true })

  try {
    const existing = await runGit(cwd, ['worktree', 'list', '--porcelain'])
    if (existing.split('\n').some((line) => line === `worktree ${dest}`)) {
      let branch = 'detached'
      try {
        branch = (await runGit(dest, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim() || 'detached'
      } catch {
        /* detached */
      }
      return { ok: true, path: dest, branch }
    }
  } catch {
    /* list failed: try add */
  }

  try {
    await runGit(cwd, ['worktree', 'add', '--detach', dest, 'HEAD'])
    let branch = 'detached'
    try {
      branch = (await runGit(dest, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim() || 'detached'
    } catch {
      /* detached */
    }
    return { ok: true, path: dest, branch }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg || '创建 worktree 失败' }
  }
}
