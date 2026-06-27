/**
 * 工作区列表、排序与设置归一化。
 * 详见 shared/README.md
 */
import type { AppSettings, WorkspaceItem } from './types'

/** @deprecated 旧版 Home 工作区 ID；新安装不再注入 Home */
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

/** 排序：置顶 → 普通 */
export function sortWorkspaces(workspaces: WorkspaceItem[]): WorkspaceItem[] {
  const pinned = workspaces.filter((w) => w.pinned)
  const normal = workspaces.filter((w) => !w.pinned)
  return [...pinned, ...normal]
}

/** 解析有效 activeWorkspaceId（无工作区时为空） */
export function pickActiveWorkspaceId(
  workspaces: WorkspaceItem[],
  preferredId: string
): string {
  if (preferredId && workspaces.some((w) => w.id === preferredId)) return preferredId
  return workspaces[0]?.id ?? ''
}

/** 迁移旧版 workspacePath；不再自动注入 Home（Windows / 桌面通用） */
export function normalizeSettings(
  raw: Partial<AppSettings> & { workspacePath?: string },
  _homeDir?: string
): AppSettings {
  const providers = Array.isArray(raw.providers) ? raw.providers : []
  let activeProviderId = raw.activeProviderId ?? ''
  if (activeProviderId && !providers.some((p) => p.id === activeProviderId)) {
    activeProviderId = providers[0]?.id ?? ''
  }

  const merged: AppSettings = {
    workspacePath: '',
    permissionMode: raw.permissionMode ?? 'sandbox',
    networkMode: raw.networkMode ?? 'open',
    workspaceProfile: raw.workspaceProfile ?? '',
    providers,
    activeProviderId,
    skillRepoUrls: raw.skillRepoUrls ?? [],
    computerUseEnabled: raw.computerUseEnabled ?? true,
    browserUseEnabled: raw.browserUseEnabled ?? true,
    installedSkillIds: raw.installedSkillIds ?? [],
    petEnabled: raw.petEnabled ?? false,
    workspaces: raw.workspaces ?? [],
    activeWorkspaceId: raw.activeWorkspaceId ?? ''
  }

  let workspaces = [...merged.workspaces].filter((w) => !w.isHome)

  if (workspaces.length === 0 && raw.workspacePath) {
    workspaces.push({
      id: crypto.randomUUID(),
      path: raw.workspacePath,
      label: basename(raw.workspacePath) || '工作区'
    })
  }

  workspaces = dedupeByPath(workspaces)

  merged.workspaces = sortWorkspaces(workspaces)
  merged.activeWorkspaceId = pickActiveWorkspaceId(workspaces, merged.activeWorkspaceId)
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
