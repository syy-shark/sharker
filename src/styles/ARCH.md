# src/styles — 全局样式

## 职责

- 主题 token、遗留玻璃/金属材质类、动效时长与曲线
- 桌面壳层走 Maka token；此处 `.glass-*` 只给尚未迁走的设置页原语，见 [docs/ui-style.md](../../docs/ui-style.md)

## 同级目录

（无子目录）

## 同级文件

| 文件 | 说明 |
|------|------|
| `global.css（含共享交互 transition 列表）` | 全局与主题 CSS 变量（浅色水滴玻璃 / 深色金属，含 `--metal-control-fill*`、`--ui-font-scale`）；共享交互 transition + 主要控件 `:focus-visible` 焦点环 |
| `glass.css` | `.glass-tile` / `.glass-card` / `.glass-popover` 等材质 |
| `motion.css` | 150/220/300ms 动效、直播文字扫光（`.live-text-shimmer`）、`.live-dot` / `.live-shimmer`、系统 reduced-motion 与应用内 `html.reduce-motion` / `html.live-hidden` / `.live-shimmer-paused`（进度圈仍转，对标 Codex #16857 / #22787 / #40531） |
| `syntax-highlight.css` | 闭合围栏 / 文件预览 `.hljs-*` 语义色（`--accent` / `--success` / `--danger` / `--warning` / `--text-*`），不发明第三套主题 |
| `maka-shell.css` | 接入 Maka 桌面壳层 styles.css（灰底 canvas + 白浮板）；补 Electron 拖拽、设置页宿主、侧栏顶栏给红绿灯让位 |
| `ARCH.md` | 本层架构说明 |
