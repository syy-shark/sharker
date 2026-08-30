# src/hooks — React Hooks

## 职责

- 跨组件复用的 UI 行为 hooks（非业务数据获取）

## 同级目录

（无子目录）

## 同级文件

| 文件 | 说明 |
|------|------|
| `usePopoverAnimation.ts` | 弹层进出；默认 180ms 后卸载 | 弹层进出：关闭时保留 DOM 播退出动画 |
| `useSlidingIndicator.ts` | 侧栏/列表滑动高亮指示器定位 |
| `useLiveStreamUi.ts` | 直播 token / 回合元信息外部 store + `useSyncExternalStore` / `useLiveStreamUiSelect` / `useLiveStreamUiSelectWhen`；16ms flush（思考/状态/散文只加长时不扫 extractFinalContent）与工具心跳 / 命令末行不通知订阅者；只通知订阅切片的直播过程/回答 / 元信息 / 查找（只订 `streaming`，命中没变不抬柱） / 「新消息」芯片（只订进度指纹）；历史列在预留行入列或仍在直播时订直播体布尔；收束关 loading 不清 store；热路径走 `live-stream-core`，combinatorial 表只在直播收束后 `prefetchLiveStreamTable`（对标 Codex #22860 / #33907 / #19260 / preserved streamed activity） |
| `useOffscreenLiveShimmer.ts` | 直播行 / 侧栏进行中点滚出视口时停扫光与脉冲（对标 Codex #16857） |
| `ARCH.md` | 本层架构说明 |
