/**
 * Memory 系统初始化（PGlite + workspace 同步）。
 */
import { getMemoryDb, memoryDbDir } from './db'
import { syncWorkspacesFromSettings } from './workspaces-sync'
import type { AppSettings } from '../../shared/types'

/** 应用启动时调用 */
export async function initMemorySystem(homeDir: string, settings: AppSettings): Promise<void> {
  await getMemoryDb(homeDir)
  await syncWorkspacesFromSettings(settings)
}

/** 设置变更后同步工作区 */
export async function onSettingsChanged(settings: AppSettings): Promise<void> {
  await syncWorkspacesFromSettings(settings)
}

export { memoryDbDir }
