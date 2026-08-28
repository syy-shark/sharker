import { describe, expect, it } from 'vitest'
import { navBack, navForward, pushNav, sameNav } from './nav-history'

describe('nav history', () => {
  it('pushes and drops the forward stack', () => {
    let stack: ReturnType<typeof pushNav>['stack'] = []
    let index = -1
    ;({ stack, index } = pushNav(stack, index, { page: 'chat', conversationId: 'a' }))
    ;({ stack, index } = pushNav(stack, index, { page: 'chat', conversationId: 'b' }))
    ;({ stack, index } = navBack(stack, index))
    ;({ stack, index } = pushNav(stack, index, { page: 'settings', settingsTab: 'models' }))
    expect(stack.map((e) => e.conversationId ?? e.page)).toEqual(['a', 'settings'])
    expect(index).toBe(1)
  })

  it('walks back and forward', () => {
    let { stack, index } = pushNav([], -1, { page: 'chat', conversationId: 'a' })
    ;({ stack, index } = pushNav(stack, index, { page: 'chat', conversationId: 'b' }))
    const back = navBack(stack, index)
    expect(back.entry?.conversationId).toBe('a')
    const fwd = navForward(back.stack, back.index)
    expect(fwd.entry?.conversationId).toBe('b')
    expect(navBack(stack, 0).entry).toBeNull()
    expect(sameNav({ page: 'chat' }, { page: 'chat', conversationId: null })).toBe(true)
  })
})
