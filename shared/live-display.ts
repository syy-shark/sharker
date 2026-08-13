/**
 * 直播过程展示头：从可见步骤推导当前头标签/详情。
 * 与 TurnFlow 渲染共用，保证“头 = 当前步骤”。
 */

export type LiveDisplayStep = {
  id: string
  title: string
  detail?: string
  status: 'active' | 'done' | 'error' | 'cancelled' | string
  kind?: string
}

export type LiveHead = {
  label: string
  detail?: string
  step: LiveDisplayStep | null
}

/** 当前头步骤：优先最后一个 active，否则最后一项 */
export function selectLiveHeadStep(steps: LiveDisplayStep[]): LiveDisplayStep | null {
  if (!steps.length) return null
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i]?.status === 'active') return steps[i]
  }
  return steps[steps.length - 1] || null
}

export function buildLiveHead(options: {
  steps: LiveDisplayStep[]
  approvalWaiting?: boolean
  fallbackLabel?: string
}): LiveHead {
  const step = selectLiveHeadStep(options.steps)
  if (options.approvalWaiting) {
    const title = step?.title?.startsWith('等待确认') ? step.title : '等待确认'
    return {
      label: title,
      detail: '高危操作需要你确认后才能继续',
      step
    }
  }
  return {
    label: step?.title?.trim() || options.fallbackLabel || '处理中',
    detail: step?.detail,
    step
  }
}

/**
 * 是否应追加合成「规划下一步」：
 * - 过程已空闲
 * - 已有实质工具/旁白
 * - 末步不是“正在准备…”
 * - 末步标题本身也还不是规划
 */
export function shouldSynthesizePlanning(options: {
  hasActiveWork: boolean
  hasToolOrNarration: boolean
  generatingAnswer: boolean
  approvalWaiting: boolean
  lastStepTitle?: string
}): boolean {
  if (options.approvalWaiting || options.generatingAnswer || options.hasActiveWork) return false
  if (!options.hasToolOrNarration) return false
  const last = (options.lastStepTitle || '').trim()
  if (/正在准备/.test(last)) return false
  if (last.includes('规划下一步')) return false
  return true
}
