import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CONVERSATION_TITLE,
  applyCustomTitle,
  buildForkedConversation,
  parseForkDestination,
  createEmptyConversation,
  chatSearchMatchHint,
  conversationPreview,
  filterChatList,
  collectAttentionConversationIds,
  conversationIdsToArchiveForProject,
  filterSidebarChats,
  forkConversationTitle,
  nextActivitySidebarFilter,
  formatPinNote,
  formatRenameNote,
  nextLiveConversationId,
  parseRenameArgs,
  resolveConversationGitBranch,
  resolveConversationPath,
  sortConversationsByCreatedAt,
  splitLiveConversations,
  splitPinnedConversations
} from './conversation'

describe('conversation search', () => {
  it('filters chats by title, custom title or id', () => {
    const items = [
      { id: 'c1', title: '修好滚动' },
      { id: 'c2', title: '审查队列', customTitle: '直播卡顿' }
    ]
    expect(filterChatList(items, '滚动').map((c) => c.id)).toEqual(['c1'])
    expect(filterChatList(items, '直播').map((c) => c.id)).toEqual(['c2'])
    expect(filterChatList(items, 'c2').map((c) => c.id)).toEqual(['c2'])
    expect(filterChatList(items, '')).toEqual(items)
    expect(filterChatList(items, 'zzz')).toEqual([])
  })

  it('matches chat content and git branch like Codex expanded search', () => {
    const items = [
      {
        id: 'c1',
        title: '修好滚动',
        preview: '直播时贴底滚动会卡一帧',
        gitBranch: 'fix/login-redirect'
      },
      { id: 'c2', title: '审查队列', preview: '只暂存本任务改过的文件' }
    ]
    expect(filterChatList(items, '贴底').map((c) => c.id)).toEqual(['c1'])
    expect(filterChatList(items, 'fix/login-redirect').map((c) => c.id)).toEqual(['c1'])
    expect(chatSearchMatchHint(items[0], '贴底')).toBe('直播时贴底滚动会卡一帧')
    expect(chatSearchMatchHint(items[0], 'fix/login')).toBe('fix/login-redirect')
    expect(chatSearchMatchHint(items[0], '滚动')).toBe('')
    expect(conversationPreview([{ role: 'user', content: '先改滚动' }])).toBe('先改滚动')
    expect(resolveConversationGitBranch({ baseRef: 'HEAD', workspaceBranch: 'main' })).toBe('main')
    expect(resolveConversationPath({ worktreePath: '/tmp/wt', workspacePath: '/repo' })).toBe(
      '/tmp/wt'
    )
    expect(resolveConversationPath({ workspacePath: '/repo' })).toBe('/repo')
  })

  it('parses /rename and formats the note', () => {
    expect(parseRenameArgs('')).toEqual({ kind: 'prompt' })
    expect(parseRenameArgs('  直播卡顿  ')).toEqual({ kind: 'set', title: '直播卡顿' })
    expect(applyCustomTitle('  直播卡顿  ')).toBe('直播卡顿')
    expect(applyCustomTitle('   ')).toBeUndefined()
    expect(formatRenameNote('直播卡顿')).toBe('对话已重命名为「直播卡顿」。')
    expect(formatRenameNote(undefined)).toContain('清除')
    expect(formatPinNote(true)).toContain('置顶')
    expect(formatPinNote(false)).toContain('取消')
  })

  it('sorts pinned conversations first then by createdAt', () => {
    const items = [
      { id: 'a', title: 'a', createdAt: 1, updatedAt: 1, workspaceId: 'w', messageCount: 0 },
      { id: 'b', title: 'b', createdAt: 2, updatedAt: 2, workspaceId: 'w', messageCount: 0, pinned: true },
      { id: 'c', title: 'c', createdAt: 3, updatedAt: 3, workspaceId: 'w', messageCount: 0 }
    ]
    expect(sortConversationsByCreatedAt(items).map((c) => c.id)).toEqual(['b', 'a', 'c'])
    expect(splitPinnedConversations(items).pinned.map((c) => c.id)).toEqual(['b'])
  })

  it('names a forked thread', () => {
    expect(forkConversationTitle('修好滚动')).toBe('修好滚动（分叉）')
    expect(forkConversationTitle('修好滚动（分叉）')).toBe('修好滚动（分叉）')
    expect(forkConversationTitle('  ')).toBe(`${DEFAULT_CONVERSATION_TITLE}（分叉）`)
  })

  it('parses /fork into local or a new worktree', () => {
    expect(parseForkDestination('')).toBe('local')
    expect(parseForkDestination('local')).toBe('local')
    expect(parseForkDestination('worktree')).toBe('worktree')
    expect(parseForkDestination('WT extra')).toBe('worktree')
    expect(parseForkDestination('isolated')).toBe('worktree')
    expect(parseForkDestination('cloud')).toBe('local')
  })

  it('copies messages into a new conversation without sharing objects', () => {
    const created = createEmptyConversation('ws')
    const sourceMsg = { id: 'm1', role: 'user' as const, content: '先改滚动' }
    const forked = buildForkedConversation(created, {
      title: '修好滚动',
      messages: [sourceMsg]
    })
    expect(forked.id).toBe(created.id)
    expect(forked.title).toBe('修好滚动（分叉）')
    expect(forked.messages[0]).toEqual(sourceMsg)
    expect(forked.messages[0]).not.toBe(sourceMsg)
  })

  it('cycles the next live conversation needing attention', () => {
    expect(nextLiveConversationId(['a', 'b', 'c'], 'b')).toBe('c')
    expect(nextLiveConversationId(['a', 'b', 'c'], 'c')).toBe('a')
    expect(nextLiveConversationId(['a'], 'a')).toBe('a')
    expect(nextLiveConversationId([], 'a')).toBeNull()
  })

  it('splits live conversations into a first-class task list', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(splitLiveConversations(items, ['b', 'c'])).toEqual({
      live: [{ id: 'b' }, { id: 'c' }],
      rest: [{ id: 'a' }]
    })
  })

  it('filters sidebar chats like Codex chronological / state filters', () => {
    const items = [
      { id: 'a', unread: true },
      { id: 'b', pinned: true },
      { id: 'c' }
    ]
    expect(filterSidebarChats(items, 'chronological', ['c']).map((c) => c.id)).toEqual([
      'a',
      'b',
      'c'
    ])
    expect(filterSidebarChats(items, 'live', ['c']).map((c) => c.id)).toEqual(['c'])
    expect(filterSidebarChats(items, 'unread', []).map((c) => c.id)).toEqual(['a'])
    expect(filterSidebarChats(items, 'pinned', []).map((c) => c.id)).toEqual(['b'])
    expect(filterSidebarChats(items, 'waiting', [], ['a', 'c']).map((c) => c.id)).toEqual([
      'a',
      'c'
    ])
    expect(nextActivitySidebarFilter('chronological')).toBe('waiting')
    expect(nextActivitySidebarFilter('waiting')).toBe('chronological')
    expect(nextActivitySidebarFilter('live')).toBe('chronological')
    expect(nextActivitySidebarFilter('unread')).toBe('chronological')
    expect(
      collectAttentionConversationIds({
        conversations: items,
        liveIds: ['c'],
        waitingIds: ['b']
      }).map((id) => id)
    ).toEqual(['b', 'c'])
    expect(
      conversationIdsToArchiveForProject(
        [
          { id: 'a', workspaceId: 'p1' },
          { id: 'b', workspaceId: 'p2' },
          { id: 'c', workspaceId: 'p1', status: 'archived' },
          { id: 'd', workspaceId: 'p1' }
        ],
        'p1',
        ['d']
      )
    ).toEqual(['a'])
    expect(conversationIdsToArchiveForProject([], '')).toEqual([])
  })
})
