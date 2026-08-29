# src/styles — 全局样式

## 职责

- 主题 token、玻璃/金属材质类、动效时长与曲线
- 新组件优先用此处变量与 `.glass-*` 类，见 [docs/ui-style.md](../../docs/ui-style.md)

## 同级目录

（无子目录）

## 同级文件

| 文件 | 说明 |
|------|------|
| `global.css（含共享交互 transition 列表）` | 全局与主题 CSS 变量（浅色水滴玻璃 / 深色金属，含 `--metal-control-fill*`、`--ui-font-scale`）；共享交互 transition + 主要控件 `:focus-visible` 焦点环 |
| `glass.css` | `.glass-tile` / `.glass-card` / `.glass-popover` 等材质 |
| `motion.css` | 150/220/300ms 动效、直播文字扫光（`.live-text-shimmer`）、`.live-dot` / `.live-shimmer`、系统 reduced-motion 与应用内 `html.reduce-motion` / `html.live-hidden` / `.live-shimmer-paused`（进度圈仍转，对标 Codex #16857 / #22787 / #40531） |
| `syntax-highlight.css` | 闭合围栏 / 文件预览 `.hljs-*` 语义色（`--accent` / `--success` / `--danger` / `--warning` / `--text-*`），不发明第三套主题 |
| `ARCH.md` | 本层架构说明 |
