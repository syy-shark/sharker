# Sharker UI 风格规范

> **拍板结论（2026-08-31）**  
> 桌面壳层跟 **Sharker**：灰底 canvas + 白浮板 raised。  
> 不要再把 Sharker 表面 token 改写成水滴玻璃，也不要铺平 `.mainColumn`。

本文档给人和 AI 共用。改 UI 前先读；改材质/主题后同步更新本文档与 `src/ARCH.md`。权威细节在 `src/sharker-core/DESIGN.md`。

## 1. 两套外观（不可再扩）

| 主题 | `uiTheme` | 材质 | 用户可见描述 |
|------|-----------|------|--------------|
| 浅色 | `light` | Sharker 灰底 + 白内容板；darwin 侧栏可透 `sidebar` vibrancy | 冷静、原生、紧凑 |
| 深色 | `dark` | Sharker 深色表面阶梯（sunken / base / raised / overlay） | 石墨底板 + 亮阅读面 |

规则：

- 设置 → 外观 **只保留这两种**，不要透明度滑杆、不要第三套主题。
- 历史字段 `uiGlass` 仅兼容旧设置。**UI 不暴露调节。**
- 不要为单个页面发明独立配色体系；语义色（成功/危险/警告）走 Sharker token。
- 壳层几何：`variant="elevated"`、`.sharker-panel-detail` 的 4px 缝、`.mainColumn` 的 `--radius-modal` 浮板。

## 2. 浅色：Sharker 灰底白浮板

### 2.1 目标观感

- **Canvas recedes**：侧栏与主区地板同色（`--surface-canvas` / `--agents-layout-bg`）。
- **内容抬起**：对话板、composer 卡走 `--surface-raised` / `--agents-content-area-bg`，纯白。
- **一条缝**：浮板与地板只靠 4px gap 分开，不要再画一条侧栏竖线，也不要叠玻璃渐变。
- **干净**：不要彩色氛围光、不要强饱和渐变底、不要通用玻璃拟态。

### 2.2 实现要点

| 层 | 要求 |
|----|------|
| 窗口 | macOS `vibrancy: sidebar`（浅色）；背景跟 canvas（约 `#f6f6f6`） |
| 最后面大背景 | `.appFrame` 画 `--surface-canvas`；darwin 可由 Sharker `theme-glass.css` 透出侧栏 vibrancy |
| 壳层布局 | **通顶**：侧栏与主区同高到窗口顶。拖拽只走 `.sharker-window-titlebar` |
| 侧栏结构 | Sharker `SessionListPanel`：新任务 / 扩展 / 定时任务 · 按时间/按项目 · 最近 · 设置 |
| 侧栏收起 | 跟 Sharker：收起为 0 宽，标题栏按钮展开；不要自造 52px 图标轨 |
| 主区浮板 | `.sharker-panel-detail` 留缝，`.mainColumn` 画 raised + 圆角 |
| 对话柱 | 消息与输入 `max-width = --sharker-reading-measure`（720px）居中 |
| 卡片/输入框 | 走 Sharker / Astryx token；不要给 `.sharker-composer-astryx` 再套一层 glass |

### 2.3 推荐 token / 类

- Token：`src/sharker-core/apps/desktop/src/renderer/sharker-tokens.css`（`--surface-*`、`--foreground*`、`--border*`）
- 壳层：`src/sharker-core/apps/desktop/src/renderer/styles/shell-layout.css`
- 接入层：`src/styles/sharker-shell.css` 只补 Electron 拖拽与设置页宿主
- 旧设置页原语仍可用 `src/styles/glass.css`，但不要覆盖 Sharker 壳层

### 2.4 禁止（浅色）

- 把 `--surface-*` / `--agents-*-bg` 改成 `transparent` 再铺玻璃渐变
- 用 `!important` 把 `.sharker-shell-astryx` / `.mainColumn` 背景冲掉
- 为“更好看”加彩色径向氛围底
- 新组件只在控件上玻璃化、背景另起一套材质语言

## 3. 深色：Sharker 表面阶梯（对照，勿混用浅色玻璃）

- 走 Sharker `--surface-sunken` / `--surface-base` / `--surface-raised` / `--surface-overlay`
- 阅读面仍是该模式下最亮的一档；不要把浅色 glass 配方直接反色
- 新增深色 UI 时复用 `html.theme-dark` + Sharker token

## 4. 新功能 / 新组件清单

做任何新 UI 前过一遍：

1. **主题**：是否同时适配 `theme-light` 与 `theme-dark`？
2. **材质**：是否走 Sharker `--surface-*` / `--foreground*`，而不是自造玻璃层？
3. **背景**：页面是否坐在 `.mainColumn` 浮板上，而不是再铺一块实色/透明罩？
4. **边与高光**：分隔是否只选 fill / line / shadow 之一（Sharker One Means Rule）？
5. **文字对比**：优先 `--foreground` / `--foreground-secondary` / `--muted-foreground`
6. **动效**：复用 `styles/motion.css` 时长与曲线；直播过程用 `.live-text-shimmer` 表示存活，思考用可折叠旁白而不是灰卡片；尊重 `prefers-reduced-motion`。
7. **硬编码**：是否避免写死仅浅色可用的颜色？

### 推荐写法

```tsx
<section className="my-panel">...</section>
```

```css
.my-panel {
  background: var(--surface-raised);
  border: var(--border-width-hairline) solid var(--border-soft);
  border-radius: var(--radius-container);
  color: var(--foreground);
}
```

## 5. 关键文件

| 文件 | 职责 |
|------|------|
| `src/sharker-core/DESIGN.md` | Sharker 表面 / 墨水 / 圆角权威 |
| `src/styles/sharker-shell.css` | 接入 Sharker `styles.css`；只补拖拽与设置宿主 |
| `src/styles/global.css` | 旧设置页与遗留控件 token |
| `src/styles/motion.css` | 动效 |
| `src/App.tsx` | `variant="elevated"` 壳 + `theme-light` / `theme-dark` |
| `src/components/settings/AppearanceSettings.tsx` | 外观设置（仅两主题） |
| `electron/main/index.ts` | 浅色 `sidebar` vibrancy / 深色实色 |
| `shared/types.ts` | `uiTheme` / `uiGlass` 字段说明 |

## 6. 验收标准（浅色）

- 能看出灰地板和白浮板两档，不是一整块通透玻璃
- 侧栏与主区地板同色；对话板有圆角和 4px 缝
- 输入框是 Sharker composer 卡，不是自造玻璃岛
- 新页面与旧页面放在一起，壳层材质语言一致

## 7. 文档维护

- 改外观行为 → 更新本文档 + `src/ARCH.md`「样式」节
- 若改主题数量或材质定义 → 同步 `AGENTS.md` 必读列表中的入口说明

## 直播过程动效

- 闲聊/连接：一行状态字 + 耗时（`.live-text-shimmer`），不要呼吸灯
- 思考：Cursor 式可折叠 Thought（chevron + 弱对比旁白 + 左细轨），**不要**灰底卡片倾倒 CoT / CSS
- 半截 CSS 不当演示；有真实 HTML 结构后再上屏
- 工具间隙显示「规划下一步」；仅在已有回答流时显示「生成回答」
- 主题色统一使用 CSS 变量（`--accent` / `--on-accent` 等），避免硬编码蓝/白
