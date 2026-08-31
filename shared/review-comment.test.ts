import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  formatReviewCommentsPrompt,
  nextLiveReviewFindings,
  parseLiveReviewFindings,
  parseReviewFindings,
  REVIEW_FINDINGS_INTRO,
  REVIEW_HOVER_LINE_HINT,
  REVIEW_INLINE_COMMENT_FOLLOW_UP,
  REVIEW_PLUS_BUTTON_HINT,
  REVIEW_WRITE_FEEDBACK_HINT,
  sameReviewFindings
} from './review-comment'

describe('review comments', () => {
  it('formats line-anchored comments for the agent', () => {
    const prompt = formatReviewCommentsPrompt([
      {
        id: '1',
        path: 'src/app.ts',
        line: 12,
        side: 'new',
        content: 'catch {}',
        text: '不要吞掉错误，写日志后再抛出'
      }
    ])
    expect(prompt).toContain('src/app.ts:12')
    expect(prompt).toContain('不要吞掉错误')
    expect(prompt).toContain('catch {}')
    expect(prompt).toContain('保持范围最小')
    expect(prompt.startsWith('请根据审查行内评论修改')).toBe(true)
  })

  it('parses review-findings fences and ### path:line headings', () => {
    const fromFence = parseReviewFindings(
      '概述\n\n```review-findings\n[{"path":"src/a.ts","line":4,"side":"new","text":"缺少测试"}]\n```\n'
    )
    expect(fromFence).toEqual([
      {
        id: 'finding-0-src/a.ts:4',
        path: 'src/a.ts',
        line: 4,
        side: 'new',
        content: '',
        text: '缺少测试'
      }
    ])
    const fromHeading = parseReviewFindings('### src/b.ts:9\n不要吞错\n')
    expect(fromHeading[0]?.path).toBe('src/b.ts')
    expect(fromHeading[0]?.line).toBe(9)
    expect(fromHeading[0]?.text).toContain('不要吞错')
    expect(parseLiveReviewFindings('概述\n```review-findings\n[{"path":"src/a.ts","line":4,"text":"缺少测试"}]')).toEqual(
      []
    )
    expect(
      parseLiveReviewFindings(
        '概述\n```review-findings\n[{"path":"src/a.ts","line":4,"text":"缺少测试"}]\n```\n还在写'
      )
    ).toEqual(fromFence)
    expect(parseLiveReviewFindings('### src/b.ts:9\n不要吞错\n')).toEqual([])
    expect(sameReviewFindings(fromFence, fromFence)).toBe(true)
    expect(sameReviewFindings(fromFence, [])).toBe(false)
    const closed =
      '概述\n```review-findings\n[{"path":"src/a.ts","line":4,"text":"缺少测试"}]\n```\n'
    const first = nextLiveReviewFindings(null, closed)
    expect(first.findings).toEqual(fromFence)
    expect(nextLiveReviewFindings(first, `${closed}还在写`)).toBe(first)
    expect(nextLiveReviewFindings(first, '概述')).toEqual({ findings: [], fence: '' })
    const panelSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/components/panel/ChangesPanel.tsx'), 'utf8')
    expect(panelSrc).toContain('nextLiveReviewFindings')
    expect(panelSrc).toContain('useLiveStreamUiSelect')
    expect(panelSrc).toContain('reviewDiffKeysForFindings')
    expect(panelSrc).toContain('mergeReviewExpandedKeys')
    expect(REVIEW_FINDINGS_INTRO).toMatch(/inline comments in the review pane/)
    expect(REVIEW_INLINE_COMMENT_FOLLOW_UP).toMatch(/send a message back to the chat/)
    expect(REVIEW_HOVER_LINE_HINT).toBe('Hover over the line you want to comment on.')
    expect(REVIEW_PLUS_BUTTON_HINT).toBe('Select the + button that appears.')
    expect(REVIEW_WRITE_FEEDBACK_HINT).toBe('Write your feedback and submit it.')
    const diffSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/components/CodeDiffBlock.tsx'),
      'utf8'
    )
    expect(diffSrc).toContain('REVIEW_FINDINGS_INTRO')
    expect(diffSrc).toContain('REVIEW_INLINE_COMMENT_FOLLOW_UP')
    expect(diffSrc).toContain('REVIEW_HOVER_LINE_HINT')
    expect(diffSrc).toContain('REVIEW_PLUS_BUTTON_HINT')
    expect(diffSrc).toContain('REVIEW_WRITE_FEEDBACK_HINT')
    expect(diffSrc).not.toContain('aria-label="行内评论"')
    expect(diffSrc).not.toContain('写给 Agent 的行内意见')
    expect(diffSrc).not.toContain('>Submit<')
  })
})
