import { describe, expect, it } from 'vitest'
import {
  appendAssistantMessage,
  historicalMessagesDuringLive,
  hasLiveAssistantBody,
  shouldHideReservedDuringLive,
  liveRowMessageId,
  shouldMountLiveAssistantSlot,
  shouldBeginNewLiveReservation,
  shouldPublishEmptyLiveBodyOnBeginTurn,
  shouldPinActiveLiveAssistant,
  shouldRenderLiveAssistantRow,
  shouldHoldLiveHandoff,
  shouldRetireLiveOnHandoffHold,
  shouldStreamLiveAssistant,
  shouldAdoptLiveHandoff,
  shouldCancelLiveHandoffWithoutCommit,
  shouldPublishLiveStreamDuringHandoff,
  shouldPreserveLiveDiffExpanded,
  splitTranscriptAroundLiveHandoff,
  pinnedLiveAssistantId,
  pinnedLiveAssistantIds,
  nextRetiredLiveArticles,
  nextEjectedLiveArticles,
  nextArchivedLiveArticles,
  snapshotRetiredLiveProcess,
  takeEjectedLiveOverflow,
  retireLiveArticle,
  retiredLiveArticle,
  frozenHistoricalArticle,
  RETIRED_LIVE_LIMIT,
  EJECTED_LIVE_LIMIT,
  splitTranscriptAroundPinnedLive,
  nextPinnedTranscriptGaps,
  reusePinnedTranscriptGaps,
  nextPinnedLiveAssistantIds,
  reusePinnedLiveIds,
  nextPinnedAfterGaps,
  nextActivePinnedLiveSlots,
  nextFrozenPinnedLiveSlots,
  nextPinnedLiveRowNodes,
  nextHistoricalRowNodes,
  nextPinnedAfterRowNodes,
  sameActivePinnedLiveSlotIdentity,
  sameFrozenPinnedLiveSlotIdentity,
  sameHistoricalRowIdentity,
  shouldAttachLiveApprovalToPinnedSlot,
  shouldAttachLiveLoadingToPinnedSlot,
  shouldMountActiveLiveSlot,
  shouldMountUnpinnedLiveSlot,
  shouldStreamPinnedLiveAssistant,
  historicalMessagesHidingIds,
  upsertAssistantMessage,
  cancelQueuedPrompt,
  clearDoneCommitted,
  createQueuedPrompt,
  dequeueForConversation,
  enqueueForConversation,
  moveQueuedPrompt,
  takeQueuedPrompt,
  updateQueuedPromptText,
  isDoneCommittedFor,
  listQueuedForConversation,
  markDoneCommitted,
  nextFollowUpAfterTurn,
  resolveCommitConversationId,
  resolveStopAction,
  shouldAbandonInFlightTurn,
  shouldAcceptDoneEvent,
  shouldApplyStreamToActive,
  shouldCommitToActiveUi,
  type DoneCommittedMap
} from './session-runtime'
import type { ChatMessage } from './types'

describe('session / queue isolation', () => {
  it('follow-up queued under A never dispatches under B after a switch', () => {
    let queues = {}
    const itemA = createQueuedPrompt('conv-a', 'follow-up for A', undefined, 'qa1', {
      providerId: 'openai-chatgpt',
      thinkingLevel: 'high'
    })
    queues = enqueueForConversation(queues, 'conv-a', itemA)
    expect(listQueuedForConversation(queues, 'conv-a')[0]).toMatchObject({
      providerId: 'openai-chatgpt',
      thinkingLevel: 'high'
    })

    // 用户切到 B：A 的队列仍在 A 下
    expect(listQueuedForConversation(queues, 'conv-b')).toEqual([])
    expect(listQueuedForConversation(queues, 'conv-a')).toHaveLength(1)

    // B 完成一轮后只应取 B 的队列（空）
    const afterB = nextFollowUpAfterTurn(queues, 'conv-b')
    expect(afterB.next).toBeNull()
    expect(listQueuedForConversation(afterB.queues, 'conv-a')).toHaveLength(1)

    // A 完成后才拿到 A 的 follow-up
    const afterA = nextFollowUpAfterTurn(afterB.queues, 'conv-a')
    expect(afterA.next?.id).toBe('qa1')
    expect(afterA.next?.conversationId).toBe('conv-a')
    expect(afterA.next?.text).toBe('follow-up for A')
    expect(listQueuedForConversation(afterA.queues, 'conv-a')).toEqual([])
  })

  it('enqueue/dequeue never cross conversation boundaries', () => {
    let queues = {}
    queues = enqueueForConversation(
      queues,
      'conv-a',
      createQueuedPrompt('conv-a', 'A1', undefined, 'a1')
    )
    queues = enqueueForConversation(
      queues,
      'conv-b',
      createQueuedPrompt('conv-b', 'B1', undefined, 'b1')
    )
    queues = enqueueForConversation(
      queues,
      'conv-a',
      createQueuedPrompt('conv-a', 'A2', undefined, 'a2')
    )

    const dA = dequeueForConversation(queues, 'conv-a')
    expect(dA.next?.id).toBe('a1')
    const dB = dequeueForConversation(dA.queues, 'conv-b')
    expect(dB.next?.id).toBe('b1')
    const dA2 = dequeueForConversation(dB.queues, 'conv-a')
    expect(dA2.next?.id).toBe('a2')
  })

  it('stream chunks for A do not apply while B is active', () => {
    expect(shouldApplyStreamToActive('conv-a', 'conv-b')).toBe(false)
    expect(shouldApplyStreamToActive('conv-a', 'conv-a')).toBe(true)
    expect(shouldApplyStreamToActive(undefined, 'conv-a')).toBe(false)
    expect(shouldApplyStreamToActive('conv-a', null)).toBe(false)
  })

  it('cancel only removes the target prompt in its conversation', () => {
    let queues = {}
    queues = enqueueForConversation(
      queues,
      'conv-a',
      createQueuedPrompt('conv-a', 'keep', undefined, 'keep')
    )
    queues = enqueueForConversation(
      queues,
      'conv-a',
      createQueuedPrompt('conv-a', 'drop', undefined, 'drop')
    )
    queues = cancelQueuedPrompt(queues, 'conv-a', 'drop')
    expect(listQueuedForConversation(queues, 'conv-a').map((q) => q.id)).toEqual(['keep'])
  })

  it('edits, reorders, and takes a queued prompt in its conversation', () => {
    let queues = {}
    queues = enqueueForConversation(
      queues,
      'conv-a',
      createQueuedPrompt('conv-a', 'first', undefined, 'a1')
    )
    queues = enqueueForConversation(
      queues,
      'conv-a',
      createQueuedPrompt('conv-a', 'second', undefined, 'a2')
    )
    queues = enqueueForConversation(
      queues,
      'conv-b',
      createQueuedPrompt('conv-b', 'other', undefined, 'b1')
    )
    queues = updateQueuedPromptText(queues, 'conv-a', 'a2', 'second edited')
    queues = moveQueuedPrompt(queues, 'conv-a', 'a2', -1)
    expect(listQueuedForConversation(queues, 'conv-a').map((q) => q.id)).toEqual(['a2', 'a1'])
    expect(listQueuedForConversation(queues, 'conv-a')[0]?.text).toBe('second edited')
    const taken = takeQueuedPrompt(queues, 'conv-a', 'a2')
    expect(taken.item?.text).toBe('second edited')
    expect(listQueuedForConversation(taken.queues, 'conv-a').map((q) => q.id)).toEqual(['a1'])
    expect(listQueuedForConversation(taken.queues, 'conv-b').map((q) => q.id)).toEqual(['b1'])
  })

  it('does not drain the follow-up queue while held', () => {
    let queues = {}
    queues = enqueueForConversation(
      queues,
      'conv-a',
      createQueuedPrompt('conv-a', 'later', undefined, 'q1')
    )
    const held = nextFollowUpAfterTurn(queues, 'conv-a', { held: true })
    expect(held.next).toBeNull()
    expect(listQueuedForConversation(held.queues, 'conv-a')).toHaveLength(1)
  })
})

describe('stop / done ownership (Stop while other session queued)', () => {
  it('Stop only targets the visible busy session — not a global commit', () => {
    // A in-flight, user switched to B and B is busy (queued on turnChain)
    const onB = resolveStopAction({
      activeConversationId: 'conv-b',
      activeIsBusy: true
    })
    expect(onB.abortConversationId).toBe('conv-b')
    expect(onB.commitStopToConversationId).toBe('conv-b')
    expect(onB.commitStopToActiveUi).toBe(true)
    expect(
      resolveStopAction({ activeConversationId: null, activeIsBusy: true })
    ).toEqual({
      abortConversationId: null,
      commitStopToConversationId: null,
      commitStopToActiveUi: true
    })
    expect(shouldAbandonInFlightTurn({ turnGen: 2, myTurn: 1, doneCommitted: false })).toBe(true)
    expect(shouldAbandonInFlightTurn({ turnGen: 1, myTurn: 1, doneCommitted: true })).toBe(true)
    expect(shouldAbandonInFlightTurn({ turnGen: 1, myTurn: 1, doneCommitted: false })).toBe(false)
    // 不 busy 时不 abort（不能误杀 A）
    expect(
      resolveStopAction({ activeConversationId: 'conv-b', activeIsBusy: false })
    ).toEqual({
      abortConversationId: null,
      commitStopToConversationId: null,
      commitStopToActiveUi: false
    })
  })

  it('doneCommitted on B does not drop A’s done (and B real done is still gated)', () => {
    let map: DoneCommittedMap = {}
    // 用户在 B 上点 Stop
    map = markDoneCommitted(map, 'conv-b')
    expect(isDoneCommittedFor(map, 'conv-b')).toBe(true)
    expect(shouldAcceptDoneEvent(map, 'conv-b')).toBe(false)
    // A 的 done 仍必须接受
    expect(shouldAcceptDoneEvent(map, 'conv-a')).toBe(true)
    map = markDoneCommitted(map, 'conv-a')
    // B 重新开 turn 后可再接受
    map = clearDoneCommitted(map, 'conv-b')
    expect(shouldAcceptDoneEvent(map, 'conv-b')).toBe(true)
  })

  it('simulates Stop-on-B while A running: B stop gate must not block A done or B restart', () => {
    let map: DoneCommittedMap = {}
    // A running; B send queued then user Stop on B
    const stop = resolveStopAction({ activeConversationId: 'conv-b', activeIsBusy: true })
    map = markDoneCommitted(map, stop.commitStopToConversationId!)
    // A finishes while user still on B
    expect(shouldAcceptDoneEvent(map, 'conv-a')).toBe(true)
    map = markDoneCommitted(map, 'conv-a')
    // B was cancelled before start — its synthetic done is rejected (already stopped)
    expect(shouldAcceptDoneEvent(map, 'conv-b')).toBe(false)
    // User sends again on B
    map = clearDoneCommitted(map, 'conv-b')
    expect(shouldAcceptDoneEvent(map, 'conv-b')).toBe(true)
  })
})

describe('commitAssistantReply persist targeting', () => {
  it('resolves commit id from explicit > streamOwner > active (never silent active-only)', () => {
    expect(
      resolveCommitConversationId({
        explicitId: 'conv-a',
        streamOwnerId: 'conv-b',
        activeConversationId: 'conv-c'
      })
    ).toBe('conv-a')
    expect(
      resolveCommitConversationId({
        explicitId: null,
        streamOwnerId: 'conv-a',
        activeConversationId: 'conv-b'
      })
    ).toBe('conv-a')
    expect(
      resolveCommitConversationId({
        explicitId: null,
        streamOwnerId: null,
        activeConversationId: 'conv-b'
      })
    ).toBe('conv-b')
  })

  it('does not apply A’s assistant to active UI when viewing B', () => {
    expect(shouldCommitToActiveUi('conv-a', 'conv-b')).toBe(false)
    expect(shouldCommitToActiveUi('conv-b', 'conv-b')).toBe(true)
  })

  it('appendAssistantMessage is pure and used as the persist source for a target id', () => {
    const base: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'hi' }
    ]
    const assistant: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: 'reply for A'
    }
    const next = appendAssistantMessage(base, assistant)
    expect(next).toHaveLength(2)
    expect(next[1].content).toBe('reply for A')
    // 目标会话 A 的 next 必须带 explicit id 去 persist — 调用方契约
    const persistTarget = resolveCommitConversationId({
      explicitId: 'conv-a',
      activeConversationId: 'conv-b'
    })
    expect(persistTarget).toBe('conv-a')
    expect(shouldCommitToActiveUi(persistTarget, 'conv-b')).toBe(false)
    // B 的 transcript 不被 next 污染
    const bMessages: ChatMessage[] = [{ id: 'u2', role: 'user', content: 'on B' }]
    expect(bMessages).toHaveLength(1)
    expect(appendAssistantMessage(bMessages, assistant)[0].content).toBe('on B')
    // 直播行预留 id：查找/DOM 与收束后历史行同一条，直播中历史列先藏起来
    expect(liveRowMessageId('a1')).toBe('a1')
    expect(liveRowMessageId('')).toBe('streaming')
    expect(liveRowMessageId(null)).toBe('streaming')
    const reserved: ChatMessage = { id: 'a-live', role: 'assistant', content: 'draft' }
    const liveTranscript = [...base, reserved]
    expect(historicalMessagesDuringLive(liveTranscript, 'a-live', true).map((m) => m.id)).toEqual([
      'u1'
    ])
    expect(historicalMessagesDuringLive(liveTranscript, 'a-live', false).map((m) => m.id)).toEqual([
      'u1',
      'a-live'
    ])
    expect(
      historicalMessagesDuringLive(liveTranscript, 'a-live', true, false).map((m) => m.id)
    ).toEqual(['u1', 'a-live'])
    expect(
      shouldHideReservedDuringLive({
        isLive: true,
        hasLiveBody: true,
        reservedId: 'a-live',
        hasReservedInHistory: false
      })
    ).toBe(false)
    expect(
      shouldHideReservedDuringLive({
        isLive: true,
        hasLiveBody: true,
        reservedId: 'a-live',
        hasReservedInHistory: true
      })
    ).toBe(true)
    expect(
      shouldHideReservedDuringLive({
        isLive: true,
        hasLiveBody: false,
        reservedId: 'a-live',
        hasReservedInHistory: true
      })
    ).toBe(true)
    const hideEarlyToken = shouldHideReservedDuringLive({
      isLive: true,
      hasLiveBody: true,
      reservedId: 'a-live',
      hasReservedInHistory: false
    })
    expect(
      historicalMessagesDuringLive(
        liveTranscript,
        hideEarlyToken ? 'a-live' : null,
        hideEarlyToken
      ).map((m) => m.id)
    ).toEqual(['u1', 'a-live'])
    expect(hasLiveAssistantBody({ streaming: '', liveSegmentCount: 0 })).toBe(false)
    expect(hasLiveAssistantBody({ streaming: 'hi' })).toBe(true)
    expect(hasLiveAssistantBody({ liveSegmentCount: 2 })).toBe(true)
    expect(hasLiveAssistantBody({ thinking: '思考' })).toBe(true)
    expect(hasLiveAssistantBody({ approvalWaiting: true })).toBe(true)
    expect(
      shouldRenderLiveAssistantRow({
        loading: true,
        hasLiveBody: false,
        historyHasReserved: true
      })
    ).toBe(true)
    expect(
      shouldRenderLiveAssistantRow({
        loading: true,
        hasLiveBody: false,
        historyHasReserved: false
      })
    ).toBe(true)
    expect(
      shouldRenderLiveAssistantRow({
        loading: true,
        hasLiveBody: true,
        historyHasReserved: true
      })
    ).toBe(true)
    expect(
      shouldRenderLiveAssistantRow({
        loading: false,
        hasLiveBody: true,
        historyHasReserved: true
      })
    ).toBe(true)
    expect(
      shouldRenderLiveAssistantRow({
        loading: false,
        hasLiveBody: false,
        historyHasReserved: true
      })
    ).toBe(false)
    expect(
      shouldHideReservedDuringLive({
        isLive: false,
        hasLiveBody: true,
        reservedId: 'a-live',
        hasReservedInHistory: true
      })
    ).toBe(true)
    expect(
      shouldHideReservedDuringLive({
        isLive: false,
        hasLiveBody: false,
        reservedId: 'a-live',
        hasReservedInHistory: true
      })
    ).toBe(false)
    expect(
      shouldHideReservedDuringLive({
        isLive: true,
        hasLiveBody: false,
        reservedId: 'a-live',
        hasReservedInHistory: true
      })
    ).toBe(true)
    expect(
      shouldMountLiveAssistantSlot({
        atLatestWindow: true,
        loading: false,
        hasLiveBody: true
      })
    ).toBe(true)
    expect(
      shouldMountLiveAssistantSlot({
        atLatestWindow: true,
        loading: true,
        hasLiveBody: false
      })
    ).toBe(true)
    expect(
      shouldMountLiveAssistantSlot({
        atLatestWindow: true,
        loading: false,
        hasLiveBody: false
      })
    ).toBe(false)
    expect(
      shouldMountLiveAssistantSlot({
        atLatestWindow: false,
        loading: true,
        hasLiveBody: true
      })
    ).toBe(false)
    expect(
      shouldHoldLiveHandoff({
        hasLiveBody: true,
        liveAssistantId: 'a-live',
        historyHasReserved: true
      })
    ).toBe(true)
    expect(
      shouldHoldLiveHandoff({
        hasLiveBody: false,
        liveAssistantId: 'a-live',
        historyHasReserved: true
      })
    ).toBe(false)
    expect(
      shouldHoldLiveHandoff({
        hasLiveBody: true,
        liveAssistantId: 'a-live',
        historyHasReserved: false
      })
    ).toBe(true)
    expect(
      shouldHoldLiveHandoff({
        hasLiveBody: true,
        liveAssistantId: null,
        historyHasReserved: true
      })
    ).toBe(false)
    expect(
      shouldRetireLiveOnHandoffHold({
        holdFollowUp: true,
        liveAssistantId: 'a-live'
      })
    ).toBe(true)
    expect(
      shouldRetireLiveOnHandoffHold({
        holdFollowUp: true,
        liveAssistantId: 'a-live',
        alreadyRetired: true
      })
    ).toBe(false)
    expect(
      shouldRetireLiveOnHandoffHold({
        holdFollowUp: false,
        liveAssistantId: 'a-live'
      })
    ).toBe(false)
    expect(shouldRetireLiveOnHandoffHold({ holdFollowUp: true })).toBe(false)
    expect(shouldStreamLiveAssistant({ loading: true, handoffId: 'a-live' })).toBe(false)
    expect(shouldStreamLiveAssistant({ loading: true, handoffId: null })).toBe(true)
    expect(shouldStreamLiveAssistant({ loading: false, handoffId: null })).toBe(false)
    expect(shouldAdoptLiveHandoff({ handoffId: 'a-live', chunkType: 'turn_start' })).toBe(true)
    expect(shouldAdoptLiveHandoff({ handoffId: 'a-live', chunkType: 'think' })).toBe(true)
    expect(shouldAdoptLiveHandoff({ handoffId: 'a-live', chunkType: 'token' })).toBe(true)
    expect(shouldAdoptLiveHandoff({ handoffId: 'a-live', chunkType: 'status' })).toBe(true)
    expect(shouldAdoptLiveHandoff({ handoffId: 'a-live', chunkType: 'done' })).toBe(true)
    expect(shouldAdoptLiveHandoff({ handoffId: 'a-live', chunkType: 'steer_consumed' })).toBe(
      false
    )
    expect(shouldAdoptLiveHandoff({ handoffId: null, chunkType: 'turn_start' })).toBe(false)
    expect(shouldCancelLiveHandoffWithoutCommit({ handoffId: 'a-live' })).toBe(true)
    expect(shouldCancelLiveHandoffWithoutCommit({ handoffId: null })).toBe(false)
    expect(shouldPublishLiveStreamDuringHandoff('a-live')).toBe(false)
    expect(shouldPublishLiveStreamDuringHandoff(null)).toBe(true)
    expect(shouldPreserveLiveDiffExpanded({ streaming: true })).toBe(true)
    expect(shouldPreserveLiveDiffExpanded({ streaming: false, preserveLiveDiffs: true })).toBe(
      true
    )
    expect(shouldPreserveLiveDiffExpanded({ streaming: false, preserveLiveDiffs: false })).toBe(
      false
    )
    const followUp = {
      id: 'u2',
      role: 'user' as const,
      content: 'and then'
    }
    const around = splitTranscriptAroundLiveHandoff([...liveTranscript, followUp], 'a-live')
    expect(around.before.map((m) => m.id)).toEqual(['u1'])
    expect(around.after.map((m) => m.id)).toEqual(['u2'])
    expect(splitTranscriptAroundLiveHandoff(liveTranscript, 'missing').before.map((m) => m.id)).toEqual(
      ['u1', 'a-live']
    )
    expect(
      pinnedLiveAssistantId({
        retiredLiveId: 'a-live',
        liveHandoffId: null,
        liveAssistantId: 'b-live',
        hideReservedLive: false
      })
    ).toBe('a-live')
    expect(
      pinnedLiveAssistantId({
        retiredLiveId: null,
        liveHandoffId: 'a-live',
        liveAssistantId: 'a-live',
        hideReservedLive: false
      })
    ).toBe('a-live')
    expect(
      pinnedLiveAssistantId({
        retiredLiveId: null,
        liveHandoffId: null,
        liveAssistantId: 'a-live',
        hideReservedLive: true
      })
    ).toBe('a-live')
    expect(
      pinnedLiveAssistantId({
        retiredLiveId: null,
        liveHandoffId: null,
        liveAssistantId: 'a-live',
        hideReservedLive: false
      })
    ).toBeNull()
    expect(
      shouldMountActiveLiveSlot({
        atLatestWindow: true,
        loading: true,
        hasLiveBody: true,
        liveAssistantId: 'a-live',
        pinnedLiveId: 'a-live'
      })
    ).toBe(false)
    expect(
      shouldMountActiveLiveSlot({
        atLatestWindow: true,
        loading: true,
        hasLiveBody: true,
        liveAssistantId: 'b-live',
        pinnedLiveId: 'a-live'
      })
    ).toBe(true)
    expect(
      shouldMountActiveLiveSlot({
        atLatestWindow: true,
        loading: true,
        hasLiveBody: true,
        liveAssistantId: 'b-live',
        pinnedLiveIds: ['a-live', 'b-live']
      })
    ).toBe(false)
    expect(shouldPinActiveLiveAssistant({ loading: true, hasLiveBody: false })).toBe(true)
    expect(shouldPinActiveLiveAssistant({ loading: false, hasLiveBody: true })).toBe(true)
    expect(shouldPinActiveLiveAssistant({ loading: false, hasLiveBody: false })).toBe(false)
    expect(
      shouldBeginNewLiveReservation({
        holdFollowUp: false,
        reuseReservedLiveId: true,
        reservedId: 'a-live'
      })
    ).toBe(false)
    expect(
      shouldBeginNewLiveReservation({
        holdFollowUp: false,
        reuseReservedLiveId: true,
        reservedId: null
      })
    ).toBe(true)
    expect(
      shouldBeginNewLiveReservation({
        holdFollowUp: true,
        reuseReservedLiveId: false,
        reservedId: 'a-live'
      })
    ).toBe(false)
    expect(shouldBeginNewLiveReservation({ holdFollowUp: false })).toBe(true)
    expect(shouldPublishEmptyLiveBodyOnBeginTurn()).toBe(false)
    expect(
      shouldStreamPinnedLiveAssistant({
        pinnedId: 'a-live',
        liveAssistantId: 'a-live',
        frozen: false,
        liveStreaming: true
      })
    ).toBe(true)
    expect(
      shouldStreamPinnedLiveAssistant({
        pinnedId: 'a-live',
        liveAssistantId: 'a-live',
        frozen: true,
        liveStreaming: true
      })
    ).toBe(false)
    expect(
      shouldStreamPinnedLiveAssistant({
        pinnedId: 'a-live',
        liveAssistantId: 'b-live',
        frozen: false,
        liveStreaming: true
      })
    ).toBe(false)
    expect(
      shouldStreamPinnedLiveAssistant({
        pinnedId: 'a-live',
        liveAssistantId: 'a-live',
        frozen: false,
        liveStreaming: false
      })
    ).toBe(false)
    expect(
      shouldStreamPinnedLiveAssistant({
        pinnedId: '  a-live  ',
        liveAssistantId: 'a-live',
        frozen: false,
        liveStreaming: true
      })
    ).toBe(true)
    expect(
      shouldAttachLiveApprovalToPinnedSlot({
        pinnedId: 'b-live',
        liveAssistantId: 'b-live'
      })
    ).toBe(true)
    expect(
      shouldAttachLiveApprovalToPinnedSlot({
        pinnedId: 'a-live',
        liveAssistantId: 'b-live'
      })
    ).toBe(false)
    expect(shouldAttachLiveApprovalToPinnedSlot({ pinnedId: 'a-live' })).toBe(false)
    expect(
      shouldAttachLiveApprovalToPinnedSlot({
        pinnedId: 'a-live',
        liveAssistantId: 'a-live',
        liveHandoffId: 'a-live'
      })
    ).toBe(false)
    expect(
      shouldAttachLiveLoadingToPinnedSlot({
        pinnedId: 'b-live',
        liveAssistantId: 'b-live'
      })
    ).toBe(true)
    expect(
      shouldAttachLiveLoadingToPinnedSlot({
        pinnedId: 'a-live',
        liveAssistantId: 'b-live'
      })
    ).toBe(false)
    expect(shouldAttachLiveLoadingToPinnedSlot({ pinnedId: 'a-live' })).toBe(false)
    expect(
      shouldAttachLiveLoadingToPinnedSlot({
        pinnedId: 'a-live',
        liveAssistantId: 'a-live',
        liveHandoffId: 'a-live'
      })
    ).toBe(false)
    expect(
      shouldAttachLiveLoadingToPinnedSlot({
        pinnedId: 'b-live',
        liveAssistantId: 'b-live',
        liveHandoffId: 'a-live'
      })
    ).toBe(true)
    expect(
      shouldMountUnpinnedLiveSlot({
        pinnedCount: 0,
        pinActiveLive: true,
        atLatestWindow: true,
        loading: true,
        hasLiveBody: false
      })
    ).toBe(false)
    expect(
      shouldMountUnpinnedLiveSlot({
        pinnedCount: 1,
        pinActiveLive: false,
        atLatestWindow: true,
        loading: true,
        hasLiveBody: true
      })
    ).toBe(false)
    expect(
      shouldMountUnpinnedLiveSlot({
        pinnedCount: 0,
        pinActiveLive: false,
        atLatestWindow: true,
        loading: true,
        hasLiveBody: false
      })
    ).toBe(true)
    expect(
      shouldMountUnpinnedLiveSlot({
        pinnedCount: 0,
        pinActiveLive: false,
        atLatestWindow: false,
        loading: true,
        hasLiveBody: true
      })
    ).toBe(false)
    expect(
      pinnedLiveAssistantIds({
        liveAssistantId: 'a-live',
        hideReservedLive: false
      })
    ).toEqual([])
    expect(
      pinnedLiveAssistantIds({
        liveAssistantId: 'a-live',
        hideReservedLive: false,
        pinActiveLive: true
      })
    ).toEqual(['a-live'])
    expect(
      pinnedLiveAssistantIds({
        retiredLiveIds: ['a-live'],
        liveAssistantId: 'b-live',
        hideReservedLive: false,
        pinActiveLive: true
      })
    ).toEqual(['a-live', 'b-live'])
    expect(
      pinnedLiveAssistantIds({
        retiredLiveIds: ['a-live'],
        liveAssistantId: 'b-live',
        hideReservedLive: true,
        pinActiveLive: true
      })
    ).toEqual(['a-live', 'b-live'])
    const pinnedBeforeHide = pinnedLiveAssistantIds({
      liveAssistantId: 'a-live',
      hideReservedLive: false,
      pinActiveLive: true
    })
    expect(
      nextPinnedLiveAssistantIds(pinnedBeforeHide, {
        liveAssistantId: 'a-live',
        hideReservedLive: true,
        pinActiveLive: true
      })
    ).toBe(pinnedBeforeHide)
    const emptyPins = reusePinnedLiveIds(['a-live'], [])
    expect(emptyPins).toEqual([])
    expect(reusePinnedLiveIds(['gone'], [])).toBe(emptyPins)
    const frozenArticle = { id: 'a-live' }
    const frozenId = {
      article: frozenArticle,
      findHit: false,
      findCurrent: false
    }
    expect(sameFrozenPinnedLiveSlotIdentity(undefined, frozenId)).toBe(false)
    expect(sameFrozenPinnedLiveSlotIdentity(frozenId, frozenId)).toBe(true)
    expect(
      sameFrozenPinnedLiveSlotIdentity(frozenId, { ...frozenId, findHit: true })
    ).toBe(false)
    const frozenPrev = new Map([['a-live', 'slot-a']])
    const frozenIdentities = new Map([['a-live', frozenId]])
    let frozenBuilt = 0
    const frozenSame = nextFrozenPinnedLiveSlots(
      frozenPrev,
      frozenIdentities,
      new Map([['a-live', frozenId]]),
      () => {
        frozenBuilt += 1
        return 'next-a'
      }
    )
    expect(frozenSame.slots).toBe(frozenPrev)
    expect(frozenBuilt).toBe(0)
    const frozenEmpty = nextFrozenPinnedLiveSlots(
      frozenPrev,
      frozenIdentities,
      new Map(),
      () => 'gone'
    )
    expect(frozenEmpty.slots.size).toBe(0)
    expect(
      nextFrozenPinnedLiveSlots(frozenEmpty.slots, frozenEmpty.identities, new Map(), () => 'x')
        .slots
    ).toBe(frozenEmpty.slots)
    const grownArticle = { id: 'b-live' }
    const frozenGrown = nextFrozenPinnedLiveSlots(
      frozenPrev,
      frozenIdentities,
      new Map([
        ['a-live', frozenId],
        ['b-live', { article: grownArticle, findHit: false, findCurrent: false }]
      ]),
      (id) => `slot-${id}`
    )
    expect(frozenGrown.slots.get('a-live')).toBe('slot-a')
    expect(frozenGrown.slots.get('b-live')).toBe('slot-b-live')
    const holdId = {
      loading: false,
      isStreaming: false,
      findHit: false,
      findCurrent: false,
      approval: null,
      userInput: null,
      approvalResponding: false,
      userInputResponding: false
    }
    const liveId = { ...holdId, loading: true, isStreaming: true }
    expect(sameActivePinnedLiveSlotIdentity(undefined, holdId)).toBe(false)
    expect(sameActivePinnedLiveSlotIdentity(holdId, holdId)).toBe(true)
    expect(sameActivePinnedLiveSlotIdentity(holdId, { ...holdId, approval: { id: 'ap' } })).toBe(
      false
    )
    const activePrev = new Map([
      ['a-live', 'hold-a'],
      ['b-live', 'live-b']
    ])
    const activeIdentities = new Map([
      ['a-live', holdId],
      ['b-live', liveId]
    ])
    let activeBuilt = 0
    const activeAfterApproval = nextActivePinnedLiveSlots(
      activePrev,
      activeIdentities,
      new Map([
        ['a-live', holdId],
        ['b-live', { ...liveId, approval: { id: 'ap' } }]
      ]),
      (id) => {
        activeBuilt += 1
        return `next-${id}`
      }
    )
    expect(activeAfterApproval.slots.get('a-live')).toBe('hold-a')
    expect(activeAfterApproval.slots.get('b-live')).toBe('next-b-live')
    expect(activeBuilt).toBe(1)
    let loadingBuilt = 0
    const activeAfterLoading = nextActivePinnedLiveSlots(
      activeAfterApproval.slots,
      activeAfterApproval.identities,
      new Map([
        ['a-live', holdId],
        ['b-live', { ...liveId, approval: { id: 'ap' }, loading: false }]
      ]),
      (id) => {
        loadingBuilt += 1
        return `loading-${id}`
      }
    )
    expect(activeAfterLoading.slots.get('a-live')).toBe('hold-a')
    expect(activeAfterLoading.slots.get('b-live')).toBe('loading-b-live')
    expect(loadingBuilt).toBe(1)
    let handoffBuilt = 0
    const handoffHold = { ...holdId, loading: false }
    const handoffPrev = new Map([['a-live', 'hold-a']])
    const handoffIdentities = new Map([['a-live', handoffHold]])
    const handoffAfterFollowUp = nextActivePinnedLiveSlots(
      handoffPrev,
      handoffIdentities,
      new Map([['a-live', handoffHold]]),
      () => {
        handoffBuilt += 1
        return 'handoff-remount'
      }
    )
    expect(handoffAfterFollowUp.slots.get('a-live')).toBe('hold-a')
    expect(handoffBuilt).toBe(0)
    const rowAfter = [['u2']]
    const rowSlots = new Map<string, unknown>([
      ['a-live', 'frozen-a'],
      ['b-live', 'active-b']
    ])
    const rowFirst = nextPinnedLiveRowNodes(
      null,
      { ids: ['a-live', 'b-live'], after: rowAfter, slots: rowSlots },
      (id) => `row-${id}`
    )
    const rowLoadingFlip = nextPinnedLiveRowNodes(
      rowFirst,
      {
        ids: ['a-live', 'b-live'],
        after: rowAfter,
        slots: new Map<string, unknown>([
          ['a-live', 'frozen-a'],
          ['b-live', 'active-b-next']
        ])
      },
      (id) => `row-${id}-next`
    )
    expect(rowLoadingFlip.rows[0]).toBe(rowFirst.rows[0])
    expect(rowLoadingFlip.rows[1]).toBe('row-b-live-next')
    expect(
      nextPinnedLiveRowNodes(rowLoadingFlip, { ids: [], after: [], slots: new Map() }, () => 'x')
        .rows
    ).toEqual([])
    const histBase = {
      findHit: false,
      findCurrent: false,
      nearLive: false,
      editRequested: false,
      selectionSource: false,
      preserveLiveDiffs: false,
      isLast: false
    }
    const oldMsg = { id: 'old' }
    const ejectedMsg = { id: 'ejected' }
    const oldHistId = { ...histBase, message: oldMsg, article: null }
    const ejectedHistId = { ...histBase, message: ejectedMsg, article: null, isLast: true }
    expect(sameHistoricalRowIdentity(undefined, oldHistId)).toBe(false)
    expect(sameHistoricalRowIdentity(oldHistId, oldHistId)).toBe(true)
    expect(sameHistoricalRowIdentity(oldHistId, { ...oldHistId, findHit: true })).toBe(false)
    const histFirst = nextHistoricalRowNodes(
      null,
      ['old', 'ejected'],
      new Map([
        ['old', oldHistId],
        ['ejected', ejectedHistId]
      ]),
      (id) => `row-${id}`
    )
    let histBuilt = 0
    const ejectedArticle = { id: 'ejected' }
    const histAfterEject = nextHistoricalRowNodes(
      histFirst,
      ['old', 'ejected'],
      new Map([
        ['old', oldHistId],
        ['ejected', { ...ejectedHistId, article: ejectedArticle }]
      ]),
      (id) => {
        histBuilt += 1
        return `row-${id}-next`
      }
    )
    expect(histAfterEject.rows[0]).toBe(histFirst.rows[0])
    expect(histAfterEject.rows[1]).toBe('row-ejected-next')
    expect(histBuilt).toBe(1)
    expect(
      nextHistoricalRowNodes(
        histAfterEject,
        ['old', 'ejected'],
        histAfterEject.identities,
        () => 'should-not-build'
      )
    ).toBe(histAfterEject)
    expect(nextHistoricalRowNodes(histAfterEject, [], new Map(), () => 'x').rows).toEqual([])
    const afterOld = { id: 'after-old' }
    const afterEjected = { id: 'after-ejected' }
    const afterOldId = { ...oldHistId, message: afterOld, nearLive: true }
    const afterEjectedId = { ...ejectedHistId, message: afterEjected, nearLive: true }
    const afterFirst = nextPinnedAfterRowNodes(
      null,
      [[afterOld], [afterEjected]],
      new Map([
        ['after-old', afterOldId],
        ['after-ejected', afterEjectedId]
      ]),
      (id) => `after-${id}`
    )
    let afterBuilt = 0
    const afterEject = nextPinnedAfterRowNodes(
      afterFirst,
      [[afterOld], [afterEjected]],
      new Map([
        ['after-old', afterOldId],
        ['after-ejected', { ...afterEjectedId, article: ejectedArticle }]
      ]),
      (id) => {
        afterBuilt += 1
        return `after-${id}-next`
      }
    )
    expect(afterEject.gaps[0]).toBe(afterFirst.gaps[0])
    expect(afterEject.gaps[1]).toEqual(['after-after-ejected-next'])
    expect(afterEject.rows[0]).toBe(afterFirst.rows[0])
    expect(afterBuilt).toBe(1)
    expect(
      nextPinnedAfterRowNodes(afterEject, [[afterOld], [afterEjected]], afterEject.identities, () => {
        throw new Error('should reuse after gaps')
      })
    ).toBe(afterEject)
    expect(nextPinnedAfterRowNodes(afterEject, [], new Map(), () => 'x').gaps).toEqual([])
    expect(nextPinnedTranscriptGaps([], [], [])).toBeNull()
    const u1 = { id: 'u1', role: 'user' as const, content: 'hi' }
    const liveDraft = { id: 'a-live', role: 'assistant' as const, content: 'draft' }
    const u2 = { id: 'u2', role: 'user' as const, content: 'more' }
    expect(
      nextPinnedTranscriptGaps([u1, liveDraft, u2], ['a-live'], ['a-live'])?.map((gap) =>
        gap.map((m) => m.id)
      )
    ).toEqual([['u1'], ['u2']])
    const beforePersist = nextPinnedTranscriptGaps([u1, u2], ['a-live'], ['a-live'])
    const afterPersist = nextPinnedTranscriptGaps(
      [u1, u2, liveDraft],
      ['a-live'],
      ['a-live'],
      beforePersist
    )
    expect(afterPersist).toBe(beforePersist)
    expect(afterPersist?.[0]).toBe(beforePersist?.[0])
    expect(reusePinnedTranscriptGaps(beforePersist, beforePersist ?? [])).toBe(beforePersist)
    const emptyAfter = nextPinnedAfterGaps(null)
    expect(emptyAfter).toEqual([])
    expect(nextPinnedAfterGaps([[{ id: 'u1', role: 'user', content: 'hi' }]])).toBe(emptyAfter)
    expect(
      nextPinnedAfterGaps([
        [{ id: 'u1', role: 'user', content: 'hi' }],
        [{ id: 'u2', role: 'user', content: 'more' }]
      ]).map((gap) => gap.map((m) => m.id))
    ).toEqual([['u2']])
    expect(
      pinnedLiveAssistantIds({
        retiredLiveIds: ['a-live', 'b-live'],
        liveHandoffId: 'b-live',
        liveAssistantId: 'c-live',
        hideReservedLive: true
      })
    ).toEqual(['a-live', 'b-live', 'c-live'])
    expect(
      pinnedLiveAssistantId({
        retiredLiveIds: ['a-live', 'b-live'],
        liveAssistantId: 'c-live',
        hideReservedLive: false
      })
    ).toBe('a-live')
    const thread = [
      { id: 'u1', role: 'user' as const, content: 'one' },
      { id: 'a-live', role: 'assistant' as const, content: 'A' },
      { id: 'u2', role: 'user' as const, content: 'two' },
      { id: 'b-live', role: 'assistant' as const, content: 'B' },
      { id: 'u3', role: 'user' as const, content: 'three' }
    ]
    const pinnedSplit = splitTranscriptAroundPinnedLive(thread, ['a-live', 'b-live'])
    expect(pinnedSplit.pinnedIds).toEqual(['a-live', 'b-live'])
    expect(pinnedSplit.gaps.map((gap) => gap.map((m) => m.id))).toEqual([['u1'], ['u2'], ['u3']])
    expect(
      splitTranscriptAroundPinnedLive(
        [
          { id: 'u1', role: 'user' as const, content: 'one' },
          { id: 'a-live', role: 'assistant' as const, content: 'A' },
          { id: 'u2', role: 'user' as const, content: 'two' }
        ],
        ['a-live', 'b-live']
      ).gaps.map((gap) => gap.map((m) => m.id))
    ).toEqual([['u1'], ['u2'], []])
    const first = {
      id: 'a-live',
      parts: [],
      meta: null,
      startedAt: 1,
      copyable: 'A'
    }
    const second = {
      id: 'b-live',
      parts: [],
      meta: null,
      startedAt: 2,
      copyable: 'B'
    }
    const third = {
      id: 'c-live',
      parts: [],
      meta: null,
      startedAt: 3,
      copyable: 'C'
    }
    expect(nextRetiredLiveArticles([], first).map((a) => a.id)).toEqual(['a-live'])
    expect(nextRetiredLiveArticles([first], second).map((a) => a.id)).toEqual([
      'a-live',
      'b-live'
    ])
    expect(nextRetiredLiveArticles([first, second], third).map((a) => a.id)).toEqual([
      'b-live',
      'c-live'
    ])
    expect(retireLiveArticle([first, second], third)).toEqual({
      retired: [
        { ...second, id: 'b-live' },
        { ...third, id: 'c-live' }
      ],
      ejected: [{ ...first, id: 'a-live' }]
    })
    expect(nextEjectedLiveArticles([], [first]).map((a) => a.id)).toEqual(['a-live'])
    expect(nextEjectedLiveArticles([first], [second, third]).map((a) => a.id)).toEqual([
      'a-live',
      'b-live',
      'c-live'
    ])
    expect(RETIRED_LIVE_LIMIT).toBe(2)
    expect(EJECTED_LIVE_LIMIT).toBe(8)
    const overflow = Array.from({ length: 9 }, (_, i) => ({
      id: `e${i}`,
      parts: [],
      meta: null,
      startedAt: i,
      copyable: String(i)
    }))
    expect(nextEjectedLiveArticles([], overflow).map((a) => a.id)).toEqual(
      overflow.slice(-8).map((a) => a.id)
    )
    expect(takeEjectedLiveOverflow([], overflow)).toEqual({
      kept: overflow.slice(-8).map((item) => ({ ...item })),
      dropped: overflow.slice(0, 1).map((item) => ({ ...item, id: item.id }))
    })
    const fullEjected = overflow.slice(0, 8)
    const ninth = {
      id: 'e8',
      parts: [],
      meta: null,
      startedAt: 8,
      copyable: '8'
    }
    expect(takeEjectedLiveOverflow(fullEjected, [ninth])).toEqual({
      kept: [...fullEjected.slice(1), { ...ninth }].map((item) => ({ ...item })),
      dropped: [{ ...fullEjected[0], id: 'e0' }]
    })
    expect(takeEjectedLiveOverflow([first], [{ ...first, copyable: 'A2' }])).toEqual({
      kept: [{ ...first, copyable: 'A2' }],
      dropped: []
    })
    expect(nextArchivedLiveArticles([], [first]).map((a) => a.id)).toEqual(['a-live'])
    expect(nextArchivedLiveArticles([first], [second]).map((a) => a.id)).toEqual([
      'a-live',
      'b-live'
    ])
    const archivedOverflow = Array.from({ length: 65 }, (_, i) => ({
      id: `a${i}`,
      parts: [],
      meta: null,
      startedAt: i,
      copyable: String(i)
    }))
    expect(nextArchivedLiveArticles([], archivedOverflow).map((a) => a.id)).toEqual(
      archivedOverflow.map((a) => a.id)
    )
    expect(RETIRED_LIVE_LIMIT).toBe(2)
    expect(EJECTED_LIVE_LIMIT).toBe(8)
    expect(frozenHistoricalArticle([first], [second], 'a-live')?.copyable).toBe('A')
    expect(frozenHistoricalArticle([], [second], 'b-live')?.copyable).toBe('B')
    expect(frozenHistoricalArticle([first], [first], 'a-live')?.copyable).toBe('A')
    expect(frozenHistoricalArticle([], [], 'missing')).toBeNull()
    expect(snapshotRetiredLiveProcess({ thinkText: '  ponder  ' }).hasThought).toBe(true)
    expect(snapshotRetiredLiveProcess({ thinkText: '   ' }).hasThought).toBe(false)
    expect(
      snapshotRetiredLiveProcess({ thinkText: '', hasThought: true }).hasThought
    ).toBe(true)
    const processSnap = snapshotRetiredLiveProcess({
      processForFlow: [{ id: 't1', kind: 'thinking', content: 'ponder' }],
      thinkText: 'ponder',
      contentStreaming: true,
      steps: [{ id: 's1' } as never]
    })
    expect(processSnap.processForFlow).toHaveLength(1)
    expect(processSnap.contentStreaming).toBe(true)
    expect(processSnap.steps).toHaveLength(1)
    expect(
      nextArchivedLiveArticles([], [{ ...first, process: processSnap }])[0]?.process?.thinkText
    ).toBe('ponder')
    expect(
      takeEjectedLiveOverflow(
        [{ ...fullEjected[0], process: processSnap }, ...fullEjected.slice(1)],
        [ninth]
      ).dropped[0]?.process?.thinkText
    ).toBe('ponder')
    expect(retiredLiveArticle([first, second], 'a-live')?.copyable).toBe('A')
    expect(retiredLiveArticle([first, second], 'missing')).toBeNull()
    expect(
      historicalMessagesHidingIds([...liveTranscript, followUp], ['a-live', 'b-live']).map(
        (m) => m.id
      )
    ).toEqual(['u1', 'u2'])
    const committed: ChatMessage = { id: 'a-live', role: 'assistant', content: 'final' }
    const upserted = upsertAssistantMessage(liveTranscript, committed)
    expect(upserted).toHaveLength(2)
    expect(upserted[1]).toEqual(committed)
    expect(upsertAssistantMessage(base, committed)[1].id).toBe('a-live')
    const reservedWithTime: ChatMessage = {
      id: 'a-live',
      role: 'assistant',
      content: 'draft',
      createdAt: 42
    }
    expect(upsertAssistantMessage([...base, reservedWithTime], committed)[1].createdAt).toBe(42)
    expect(
      upsertAssistantMessage([...base, reservedWithTime], { ...committed, createdAt: 99 })[1]
        .createdAt
    ).toBe(99)
  })
})


describe('background stream ownership UI gating', () => {
  it('background turn_start does not apply while another conversation is active', () => {
    expect(shouldApplyStreamToActive('conv-a', 'conv-b')).toBe(false)
    expect(shouldApplyStreamToActive('conv-b', 'conv-b')).toBe(true)
  })
})
