/**
 * 自动化任务类型（渲染进程与主进程共用）。
 */

/** 单条自动化任务 */
export interface AutomationJob {
  id: string
  title: string
  prompt: string
  /** 简易 cron：分 时 日 月 周 */
  cron: string
  enabled: boolean
  workspacePath?: string
  lastRunAt?: string
}
