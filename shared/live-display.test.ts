import { describe, expect, it } from 'vitest'
import { buildLiveHead, selectLiveHeadStep, shouldSynthesizePlanning } from './live-display'

describe('live display head', () => {
  it('prefers latest active step over trailing done steps', () => {
    const step = selectLiveHeadStep([
      { id: '1', title: '读取文件', status: 'done' },
      { id: '2', title: '规划下一步', status: 'done' },
      { id: '3', title: '正在准备列出目录', status: 'active' }
    ])
    expect(step?.title).toBe('正在准备列出目录')
  })

  it('falls back to last step when none active', () => {
    const step = selectLiveHeadStep([
      { id: '1', title: '读取文件', status: 'done' },
      { id: '2', title: '规划下一步', status: 'done' }
    ])
    expect(step?.title).toBe('规划下一步')
  })

  it('buildLiveHead label matches active title', () => {
    const head = buildLiveHead({
      steps: [
        { id: '1', title: '读取文件', status: 'done' },
        { id: '2', title: '正在准备列出目录', detail: 'src', status: 'active' }
      ]
    })
    expect(head.label).toBe('正在准备列出目录')
    expect(head.detail).toBe('src')
  })

  it('does not synthesize planning while preparing next tool', () => {
    expect(
      shouldSynthesizePlanning({
        hasActiveWork: false,
        hasToolOrNarration: true,
        generatingAnswer: false,
        approvalWaiting: false,
        lastStepTitle: '正在准备列出目录'
      })
    ).toBe(false)
  })

  it('synthesizes planning after tools settle', () => {
    expect(
      shouldSynthesizePlanning({
        hasActiveWork: false,
        hasToolOrNarration: true,
        generatingAnswer: false,
        approvalWaiting: false,
        lastStepTitle: '读取文件'
      })
    ).toBe(true)
  })
})
