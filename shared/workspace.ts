/**
 * 工作区列表、排序与设置归一化。
 * 详见 shared/ARCH.md
 */
import type { AppSettings, WorkspaceItem } from './types'
import { ensureBuiltinProviders } from './provider-catalog'
import { parsePersonality } from './personality'
import { clampWorktreeKeepCount } from './worktree-prune'
import { clampWorktreeRoot } from './worktree-root'
import { clampUiFontScale } from './ui-font-scale'
import { parseCodeFont } from './code-font'
import { normalizeKeymap } from './keymap'
import { clampGitPrompt } from './git-prompt'
import { normalizeBranchPrefix } from './git-branch-create'
import { parseToolOutputDisplay } from './tool-output-display'
import { parseComposerEnterBehavior } from './composer-submit'
import { parseReviewDelivery } from './review-prompt'
import { normalizeExtraFolderPaths } from './workspace-folders'

/** 全局聊天工作区（不绑定具体项目目录） */
export const GLOBAL_WORKSPACE_ID = 'sharker-global'

/** 全局工作区默认显示名 */
export const GLOBAL_WORKSPACE_LABEL = '对话'

/** 全局对话目录：`<home>/.sharker/global`（无 Node path，主进程传入 homeDir） */
export function globalWorkspacePath(homeDir: string): string {
  const base = homeDir.replace(/[\\/]+$/, '')
  const sep = base.includes('\\') ? '\\' : '/'
  return `${base}${sep}.sharker${sep}global`
}

/** 旧版显示名 → 统一为「对话」 */
function isLegacyGlobalLabel(label: string | undefined): boolean {
  const t = (label ?? '').trim()
  return !t || t === 'Home' || t === '空对话' || t === 'home'
}

/** 保证存在全局「对话」工作区条目 */
export function ensureGlobalWorkspace(
  workspaces: WorkspaceItem[],
  homeDir: string
): WorkspaceItem[] {
  const globalPath = globalWorkspacePath(homeDir)
  const existing = workspaces.find((w) => w.id === GLOBAL_WORKSPACE_ID || w.isHome)
  if (existing) {
    return workspaces.map((w) =>
      w.id === existing.id
        ? {
            ...w,
            id: GLOBAL_WORKSPACE_ID,
            path: w.path || globalPath,
            label: isLegacyGlobalLabel(w.label) ? GLOBAL_WORKSPACE_LABEL : w.label,
            isHome: true
          }
        : w
    )
  }
  return [
    {
      id: GLOBAL_WORKSPACE_ID,
      path: globalPath,
      label: GLOBAL_WORKSPACE_LABEL,
      isHome: true
    },
    ...workspaces
  ]
}

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

/** 排序：全局对话(Home) → 置顶 → 普通 */
export function sortWorkspaces(workspaces: WorkspaceItem[]): WorkspaceItem[] {
  const home = workspaces.filter((w) => w.isHome || w.id === GLOBAL_WORKSPACE_ID)
  const rest = workspaces.filter((w) => !w.isHome && w.id !== GLOBAL_WORKSPACE_ID)
  const pinned = rest.filter((w) => w.pinned)
  const normal = rest.filter((w) => !w.pinned)
  return [...home, ...pinned, ...normal]
}

/** 解析有效 activeWorkspaceId（无工作区时为空） */
export function pickActiveWorkspaceId(
  workspaces: WorkspaceItem[],
  preferredId: string
): string {
  if (preferredId && workspaces.some((w) => w.id === preferredId)) return preferredId
  return workspaces[0]?.id ?? ''
}

/** 迁移旧版 workspacePath；不再自动注入 Home */
export function normalizeSettings(
  raw: Partial<AppSettings> & { workspacePath?: string },
  homeDir?: string
): AppSettings {
  const home = homeDir || ''
  // 去掉从未配置过的工厂占位（空 Key 的默认 gpt-4o-mini），避免顶栏显示假模型名
  let providers = (Array.isArray(raw.providers) ? raw.providers : []).filter((p) => {
    const noKey = !p.apiKey?.trim()
    const factoryModel = (p.model ?? '').trim() === 'gpt-4o-mini'
    const factoryName =
      !p.name?.trim() ||
      p.name === 'OpenAI Compatible' ||
      p.name === '新 API'
    const factoryId = p.id === 'default'
    if (noKey && factoryModel && (factoryId || factoryName)) return false
    return true
  })
  // 补齐内置接入（DeepSeek / xAI / OpenAI·ChatGPT / Kimi / 智谱 Coding Plan / OpenCode Go）
  providers = ensureBuiltinProviders(providers).map(migrateRetiredModelIds)
  let activeProviderId = raw.activeProviderId ?? ''
  if (activeProviderId && !providers.some((p) => p.id === activeProviderId)) {
    activeProviderId = ''
  }

  const composerEnterBehavior = parseComposerEnterBehavior(
    raw.composerEnterBehavior,
    raw.requireModEnter
  )

  const merged: AppSettings = {
    workspacePath: '',
    permissionMode: raw.permissionMode ?? 'sandbox',
    networkMode: raw.networkMode ?? 'open',
    workspaceProfile: raw.workspaceProfile ?? '',
    providers,
    activeProviderId,
    computerUseEnabled: raw.computerUseEnabled ?? true,
    browserUseEnabled: raw.browserUseEnabled ?? true,

    uiGlass: migrateUiGlass(raw),
    uiTheme: raw.uiTheme === 'dark' ? 'dark' : 'light',
    uiFontScale: clampUiFontScale(raw.uiFontScale),
    codeFont: parseCodeFont(raw.codeFont),
    codeFontScale: clampUiFontScale(raw.codeFontScale),
    personality: parsePersonality(raw.personality),
    worktreeKeepCount: clampWorktreeKeepCount(raw.worktreeKeepCount),
    worktreeRoot: clampWorktreeRoot(raw.worktreeRoot),
    memoryInjection: raw.memoryInjection !== false,
    memoryGeneration: raw.memoryGeneration !== false,
    keyboardShortcuts: normalizeKeymap(raw.keyboardShortcuts),
    followUpBehavior: raw.followUpBehavior === 'steer' ? 'steer' : 'queue',
    composerEnterBehavior,
    requireModEnter: composerEnterBehavior === 'cmdAlways',
    suggestedPrompts: raw.suggestedPrompts !== false,
    reviewDelivery: parseReviewDelivery(raw.reviewDelivery),
    gitCommitPrompt: clampGitPrompt(raw.gitCommitPrompt),
    gitPrPrompt: clampGitPrompt(raw.gitPrPrompt),
    gitForceWithLease: raw.gitForceWithLease === true,
    gitBranchPrefix: normalizeBranchPrefix(raw.gitBranchPrefix),
    toolOutputDisplay: parseToolOutputDisplay(raw.toolOutputDisplay),
    turnNotifyMode:
      raw.turnNotifyMode === 'never' || raw.turnNotifyMode === 'always'
        ? raw.turnNotifyMode
        : 'background',
    preventSleepWhileRunning: raw.preventSleepWhileRunning === true,
    popoutAlwaysOnTop: raw.popoutAlwaysOnTop === true,
    approvalNotify: raw.approvalNotify !== false,
    workspaces: raw.workspaces ?? [],
    activeWorkspaceId: raw.activeWorkspaceId ?? ''
  }

  // 保留非 Home 项目工作区；全局「对话」工作区单独注入
  let workspaces = [...merged.workspaces].filter(
    (w) => !w.isHome && w.id !== GLOBAL_WORKSPACE_ID
  )

  if (workspaces.length === 0 && raw.workspacePath) {
    const p = raw.workspacePath
    // 旧版把 home 写进 workspacePath 时不重复当项目
    if (p && !/[\\/]\.sharker[\\/]global$/.test(p)) {
      workspaces.push({
        id: crypto.randomUUID(),
        path: p,
        label: basename(p) || '工作区'
      })
    }
  }

  workspaces = dedupeByPath(workspaces)
  // 全局对话固定落在 ~/.sharker/global（会话进 memory-db，按 workspaceId 隔离）
  if (home) {
    workspaces = ensureGlobalWorkspace(workspaces, home)
  }
  workspaces = workspaces.map((w) => {
    const extraPaths = normalizeExtraFolderPaths(w.path, w.extraPaths)
    return extraPaths.length ? { ...w, extraPaths } : { ...w, extraPaths: undefined }
  })

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

/**
 * 迁移已下线/更名的默认模型 id。
 * 目标名单与 provider-catalog 当前主力一致。
 */
function migrateRetiredModelIds(
  p: import('./types').ProviderConfig
): import('./types').ProviderConfig {
  const model = (p.model ?? '').trim().toLowerCase()
  const base = (p.baseUrl ?? '').toLowerCase()
  // 网关套餐与原生厂商共用 model id，不可按名称把 Go 的 kimi-k2.6 等迁走
  if (p.id === 'opencode-go' || base.includes('opencode.ai')) return p
  const isDeepseek =
    p.id === 'deepseek' || base.includes('deepseek.com') || model.startsWith('deepseek-')
  if (isDeepseek) {
    if (model === 'deepseek-chat') {
      return { ...p, model: 'deepseek-v4-flash', contextWindow: p.contextWindow ?? 1_000_000 }
    }
    if (model === 'deepseek-reasoner') {
      return { ...p, model: 'deepseek-v4-pro', contextWindow: p.contextWindow ?? 1_000_000 }
    }
    return p
  }
  const isOpenAI =
    p.id === 'openai-chatgpt' ||
    base.includes('openai.com') ||
    base.includes('chatgpt.com') ||
    model.startsWith('gpt-') ||
    /^o[1-9]/.test(model)
  if (isOpenAI) {
    if (
      model === 'gpt-4o' ||
      model === 'gpt-4o-2024-08-06' ||
      model === 'gpt-4o-2024-11-20' ||
      model === 'gpt-4.1' ||
      model === 'gpt-5' ||
      model === 'gpt-5.1' ||
      model === 'gpt-5.2'
    ) {
      return { ...p, model: 'gpt-5.6-sol', contextWindow: p.contextWindow ?? 256_000 }
    }
    if (model === 'gpt-4o-mini' || model === 'gpt-5-mini') {
      return { ...p, model: 'gpt-5.6-luna', contextWindow: p.contextWindow ?? 256_000 }
    }
  }
  const isXai = p.id === 'xai-grok' || base.includes('x.ai') || model.startsWith('grok-')
  if (isXai) {
    if (
      model === 'grok-3' ||
      model === 'grok-3-mini' ||
      model === 'grok-4' ||
      model === 'grok-4.3' ||
      model === 'grok-build-0.1' ||
      model === 'grok-4-1-fast' ||
      model === 'grok-4-1-fast-reasoning'
    ) {
      return { ...p, model: 'grok-4.6', contextWindow: p.contextWindow ?? 500_000 }
    }
  }
  const isKimi =
    p.id === 'kimi' || base.includes('moonshot') || base.includes('kimi.ai') || model.startsWith('kimi-')
  if (
    isKimi &&
    (model === 'kimi-k2.5' ||
      model === 'kimi-k2.6' ||
      model === 'kimi-k2' ||
      model === 'kimi-k2-turbo-preview' ||
      model === 'kimi-k2-thinking')
  ) {
    return { ...p, model: 'kimi-k3', contextWindow: p.contextWindow ?? 1_000_000 }
  }
  const isZhipu =
    p.id === 'zhipu-coding' || base.includes('bigmodel') || model.startsWith('glm-')
  if (
    isZhipu &&
    (model === 'glm-4.7' ||
      model === 'glm-4.7-flash' ||
      model === 'glm-4.6' ||
      model === 'glm-5' ||
      model === 'glm-5.1')
  ) {
    return { ...p, model: 'glm-5.2', contextWindow: p.contextWindow ?? 1_000_000 }
  }
  return p
}

/** 夹紧玻璃透明度 0–1 */
function clampGlass(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return 0.72
  return Math.min(1, Math.max(0, Math.round(n * 100) / 100))
}

/** 兼容旧字段 uiTransparency / uiOpacity → uiGlass */
function migrateUiGlass(raw: {
  uiGlass?: number
  uiTransparency?: boolean
  uiOpacity?: number
}): number {
  if (typeof raw.uiGlass === 'number' && Number.isFinite(raw.uiGlass)) {
    return clampGlass(raw.uiGlass)
  }
  if (raw.uiTransparency === false) return 0
  if (typeof raw.uiOpacity === 'number' && Number.isFinite(raw.uiOpacity)) {
    return clampGlass(1 - raw.uiOpacity)
  }
  return 0.72
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

/** 可被项目选择器匹配的字段 */
export type WorkspaceSearchItem = {
  id: string
  label?: string
  path?: string
}

/** ⌘⌥⇧O 项目选择器：按显示名 / 路径 / id 过滤（对标 Codex Open project picker） */
export function filterWorkspaces<T extends WorkspaceSearchItem>(items: T[], query: string): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter((w) =>
    [w.label, w.path, w.id].some((v) => String(v || '').toLowerCase().includes(q))
  )
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
