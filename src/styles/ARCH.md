# src/styles — 全局样式

## 职责

- 主题 token、玻璃/金属材质类、动效时长与曲线
- 新组件优先用此处变量与 `.glass-*` 类，见 [docs/ui-style.md](../../docs/ui-style.md)

## 同级目录

（无子目录）

## 同级文件

| 文件 | 说明 |
|------|------|
| `global.css（含共享交互 transition 列表）` | 全局与主题 CSS 变量（浅色水滴玻璃 / 深色金属，含 `--metal-control-fill*`）；共享交互 transition + 主要控件 `:focus-visible` 焦点环 |
| `glass.css` | `.glass-tile` / `.glass-card` / `.glass-popover` 等材质 |
| `motion.css` | 150/220/300ms 动效、直播呼吸（`.live-orb` / `.live-dot` / `.live-shimmer`）、reduced-motion |
| `ARCH.md` | 本层架构说明 |
