/**
 * 直播 token / 回合元信息快照：引用没变则复用同一对象，供外部 store 订阅。
 * 工具心跳只换 meta / 秒表，不抬 ChatView（对标 Codex #22860）。
 * `liveStreamPatchFromSegments` 给 DEV seed / 开轮准备中 / 收束与中止一次写齐片段与秒表。
 * `shouldPublishTurnMetaReset`：commit 不清 store 秒表；loading 关也不整帧清空，开下一轮 / 切对话 / clear 再 reset。
 * @see shared/ARCH.md
 */
import { COMPACT_LIVE_STATUS } from './compact-activity'
import type { AssistantMeta, TurnSegment } from './types'
import {
  extractFinalContent,
  findLastSegment,
  thinkingPreviewFromSegments
} from './turn-segments'

export { COMPACT_LIVE_STATUS }

/** 对话柱直播行当前可画内容（不含回合开关） */
export interface LiveStreamUiSnapshot {
  streaming: string
  liveSegments: TurnSegment[]
  turnThinking: string
  activeTool: string | null
  /** 本轮浏览/活动/改文件；工具心跳换对象，token 不换 */
  liveTurnMeta: AssistantMeta | null
  turnStartedAt: number | null
  turnHadThinking: boolean
}

/**
 * 收束 commit 时先留着直播行的秒表 / 元信息 / 片段。
 * loading 关也不整帧清空，让直播行继续画收束体（对标 Codex preserved streamed activity）。
 * 开下一轮 / 切对话 / 显式 clear 再 `resetLiveStreamUi`。
 */
export function shouldPublishTurnMetaReset(phase: 'commit' | 'clear'): boolean {
  return phase !== 'commit'
}

/** loading 从直播变为空闲时：保留 store，不要卸直播行重挂历史气泡。 */
export function shouldResetLiveStreamUiWhenLoadingStops(): boolean {
  return false
}

/** `/compact` 开轮：一条进行中状态，写入直播 store */
export function liveCompactStatusSegment(at: number): TurnSegment {
  return {
    id: `status-compact-${at}`,
    kind: 'status',
    content: COMPACT_LIVE_STATUS,
    status: 'active',
    startedAt: at
  }
}

/** 空闲快照：收束 / 切走对话后写回 */
export const EMPTY_LIVE_STREAM_UI: LiveStreamUiSnapshot = {
  streaming: '',
  liveSegments: [],
  turnThinking: '',
  activeTool: null,
  liveTurnMeta: null,
  turnStartedAt: null,
  turnHadThinking: false
}

/** 七字段都相同则视为同一帧（片段 / meta 用引用比较） */
export function sameLiveStreamUi(
  left: LiveStreamUiSnapshot,
  right: LiveStreamUiSnapshot
): boolean {
  return (
    left.streaming === right.streaming &&
    left.liveSegments === right.liveSegments &&
    left.turnThinking === right.turnThinking &&
    left.activeTool === right.activeTool &&
    left.liveTurnMeta === right.liveTurnMeta &&
    left.turnStartedAt === right.turnStartedAt &&
    left.turnHadThinking === right.turnHadThinking
  )
}

/** 合并补丁；没有变化则退回 prev，避免订阅者无意义重绘 */
export function nextLiveStreamUi(
  prev: LiveStreamUiSnapshot,
  patch: Partial<LiveStreamUiSnapshot>
): LiveStreamUiSnapshot {
  const next: LiveStreamUiSnapshot = {
    streaming: patch.streaming ?? prev.streaming,
    liveSegments: patch.liveSegments ?? prev.liveSegments,
    turnThinking: patch.turnThinking ?? prev.turnThinking,
    activeTool: patch.activeTool !== undefined ? patch.activeTool : prev.activeTool,
    liveTurnMeta: patch.liveTurnMeta !== undefined ? patch.liveTurnMeta : prev.liveTurnMeta,
    turnStartedAt: patch.turnStartedAt !== undefined ? patch.turnStartedAt : prev.turnStartedAt,
    turnHadThinking:
      patch.turnHadThinking !== undefined ? patch.turnHadThinking : prev.turnHadThinking
  }
  return sameLiveStreamUi(prev, next) ? prev : next
}

/**
 * DEV / 开轮 / 收束：从片段拼一帧直播补丁，避免只写秒表、过程行进不了 store。
 * `streaming` / `activeTool` 未传时从片段推导；收束传入 `activeTool: null` 与最终正文。
 */
export function liveStreamPatchFromSegments(
  segments: TurnSegment[],
  extras?: Partial<
    Pick<
      LiveStreamUiSnapshot,
      'streaming' | 'activeTool' | 'turnStartedAt' | 'liveTurnMeta' | 'turnHadThinking'
    >
  >
): Partial<LiveStreamUiSnapshot> {
  const streaming =
    extras?.streaming !== undefined
      ? extras.streaming
      : extractFinalContent(segments, { isStreaming: true })
  const activeTool =
    extras?.activeTool !== undefined
      ? extras.activeTool
      : (findLastSegment(segments, (s) => s.kind === 'tool' && s.status === 'active')?.toolName ??
        null)
  return {
    streaming,
    liveSegments: segments,
    turnThinking: thinkingPreviewFromSegments(segments),
    activeTool,
    ...(extras?.turnStartedAt !== undefined ? { turnStartedAt: extras.turnStartedAt } : {}),
    ...(extras?.liveTurnMeta !== undefined ? { liveTurnMeta: extras.liveTurnMeta } : {}),
    ...(extras?.turnHadThinking !== undefined ? { turnHadThinking: extras.turnHadThinking } : {})
  }
}
