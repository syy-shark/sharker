/**
 * 工作区列表、Home 注入、排序与设置归一化。
 * 详见 shared/README.md
 */
import type { AppSettings, WorkspaceItem } from './types'

/** Home 工作区固定 ID */
export const HOME_WORKSPACE_ID = 'home'

/** 当前激活工作区的文件系统路径 */
export function getActiveWorkspacePath(settings: AppSettings): string {
  const item = settings.workspaces.find((w) => w.id === settings.activeWorkspaceId)
  if (item) return item.path
  return settings.workspacePath ?? ''
}

/** 当前激活的工作区条目 */
export function getActiveWorkspace(settings: AppSettings): WorkspaceItem | undefined {
  return settings.workspaces.find((w) => w.id === settings.activeWorkspaceId)
}

/** 排序：Home → 置顶 → 普通 */
export function sortWorkspaces(workspaces: WorkspaceItem[]): WorkspaceItem[] {
  const home = workspaces.filter((w) => w.isHome)
  const rest = workspaces.filter((w) => !w.isHome)
  const pinned = rest.filter((w) => w.pinned)
  const normal = rest.filter((w) => !w.pinned)
  return [...home, ...pinned, ...normal]
}

/** 迁移旧版单 workspacePath，补全 Home 并去重路径 */
export function normalizeSettings(
  raw: Partial<AppSettings> & { workspacePath?: string },
  homeDir: string
): AppSettings {
  const providers = Array.isArray(raw.providers) ? raw.providers : []
  let activeProviderId = raw.activeProviderId ?? ''
  if (activeProviderId && !providers.some((p) => p.id === activeProviderId)) {
    activeProviderId = providers[0]?.id ?? ''
  }

  const merged: AppSettings = {
    workspacePath: '',
    permissionMode: raw.permissionMode ?? 'sandbox',
    providers,
    activeProviderId,
    skillRepoUrls: raw.skillRepoUrls ?? [],
    workspaces: raw.workspaces ?? [],
    activeWorkspaceId: raw.activeWorkspaceId ?? ''
  }

  let workspaces = [...merged.workspaces]

  if (workspaces.length === 0 && raw.workspacePath) {
    workspaces.push({
      id: crypto.randomUUID(),
      path: raw.workspacePath,
      label: basename(raw.workspacePath) || '工作区'
    })
  }

  if (!workspaces.some((w) => w.isHome)) {
    workspaces.unshift({
      id: HOME_WORKSPACE_ID,
      path: homeDir,
      label: 'Home',
      isHome: true
    })
  } else {
    const home = workspaces.find((w) => w.isHome)!
    home.path = homeDir
    home.label = 'Home'
  }

  workspaces = dedupeByPath(workspaces)

  let activeWorkspaceId = merged.activeWorkspaceId
  if (!activeWorkspaceId || !workspaces.some((w) => w.id === activeWorkspaceId)) {
    activeWorkspaceId = HOME_WORKSPACE_ID
  }

  merged.workspaces = sortWorkspaces(workspaces)
  merged.activeWorkspaceId = activeWorkspaceId
  merged.workspacePath = getActiveWorkspacePath(merged)

  return merged
}

/** 取路径最后一段作为显示名 */
function basename(p: string): string {
  const parts = p.replace(/\/$/, '').split(/[/\\]/)
  return parts[parts.length - 1] ?? p
}

/** 按路径去重，保留首次出现 */
function dedupeByPath(workspaces: WorkspaceItem[]): WorkspaceItem[] {
  const seen = new Set<string>()
  const out: WorkspaceItem[] = []
  for (const w of workspaces) {
    const key = w.path.replace(/\/$/, '')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(w)
  }
  return out
}

/** 切换激活工作区并同步 workspacePath */
export function withActiveWorkspace(settings: AppSettings, workspaceId: string): AppSettings {
  const next = {
    ...settings,
    activeWorkspaceId: workspaceId,
    workspacePath: ''
  }
  next.workspacePath = getActiveWorkspacePath(next)
  return next
}
