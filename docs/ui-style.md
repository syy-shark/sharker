# Sharker UI 风格规范

> **拍板结论（2026-08）**  
> 外观只有两套：**浅色水滴玻璃**、**深色金属**。  
> 以后加功能、加组件、改页面，**浅色必须按本规范的水滴玻璃风格**，不要另起一套材质。

本文档给人和 AI 共用。改 UI 前先读；改材质/主题后同步更新本文档与 `src/ARCH.md`。

## 1. 两套外观（不可再扩）

| 主题 | `uiTheme` | 材质 | 用户可见描述 |
|------|-----------|------|--------------|
| 浅色 | `light` | 苹果控制中心式 **水滴玻璃**（透、磨砂、高光边） | 苹果玻璃透明感 |
| 深色 | `dark` | **深金属**（石墨、镜面高光，无磨砂模糊） | 深金属质感 |

规则：

- 设置 → 外观 **只保留这两种**，不要透明度滑杆、不要第三套主题。
- 历史字段 `uiGlass` 仅兼容旧设置；浅色运行时约 `0.82`，深色 `0`。**UI 不暴露调节。**
- 不要为单个页面发明独立配色体系；语义色（成功/危险/警告）可保留，但表面材质必须走 token。

## 2. 浅色：水滴玻璃（默认与新增 UI 基准）

### 2.1 目标观感

- **透**：最后面大背景能透出系统 vibrancy / 环境色，不是实心白/灰板。
- **水滴玻璃**：顶部高光、底部轻微密度、发丝亮边；像控制中心磁贴，不是“白雾毛玻璃塑料”。
- **层次**：大背景最透 → 卡片/输入框稍密 → 嵌套控件再密一点。
- **干净**：不要彩色氛围光、不要强饱和渐变底。

### 2.2 实现要点

| 层 | 要求 |
|----|------|
| 窗口 | macOS `transparent` + `vibrancy`（优先 `under-window`）；背景色 `#00000000` |
| 最后面大背景 | 主要在 `app-shell` 一层做透玻璃；`main` / 聊天区 / 设置页本身 **透明**，避免多层叠实 |
| 壳层布局 | **通顶**：侧栏与主区同高到窗口顶，**不要**整条 TitleBar 压在侧栏上方。红绿灯落在侧栏顶拖区 |
| 侧栏结构 | **ChatGPT 风格**：顶栏收起/新对话 · 主导航（新对话）· 置顶 / 项目 / 最近 |
| 侧栏收起 | 收起为 **图标轨**（约 52px），不占对话区；展开后完整列表 |
| 主区顶栏 | `.chat-toolbar` 极薄/透明：对话标题 + 操作；可拖窗口，无厚玻璃板 |
| 对话柱 | 消息与输入 `max-width ≈ 720px` 居中；输入框底部悬浮，无顶部分隔条 |
| 壳层材质 | `.sidebar` / `.chat-toolbar` 只留极薄分隔与高光，不要厚填充 |
| 卡片/输入框 | 用 `glass-*` 类或等价 token：半透白 + `backdrop-filter` + 内高光边 + 轻阴影 |
| 模糊 | 中等 blur + 适度 saturate；不要把 blur 叠很多层 |

### 2.3 推荐 token / 类

- Token：`src/styles/global.css` 中 `:root` / `html.theme-light`（`--glass-fill*`、`--glass-edge*`、`--glass-rim*`、`--glass-blur*`、`--glass-facet*`）
- 共用材质类：`src/styles/glass.css`
  - `.glass-tile` / `.glass-pill` / `.glass-card` / `.glass-popover` / `.glass-chip` / `.glass-orb`
- 主题类：`html.theme-light` + `html.ui-glass`（由 `App.tsx` / `AppearanceSettings` 写入）

### 2.4 禁止（浅色）

- 大面积不透明白底 / 实心灰底当主背景
- 多层 `backdrop-filter` + 高 alpha 白填充叠在一起（会变成塑料板或纯白）
- 为“更好看”加彩色径向氛围底（用户已明确不要）
- 硬编码 `#fff` / `rgba(255,255,255,0.9+)` 大面板，而不走 glass token
- 新组件只在控件上玻璃化、背景仍实色（背景与控件必须同一套材质语言）

## 3. 深色：深金属（对照，勿混用浅色玻璃）

- 不透明 / 近不透明石墨金属面
- **禁用**重 blur 磨砂（`backdrop-filter: none`）
- 镜面高光边 + 冷灰蓝金属边，不是深色毛玻璃
- 新增深色 UI 时复用 `html.theme-dark` token，不要把浅色 glass 配方直接反色

## 4. 新功能 / 新组件清单

做任何新 UI 前过一遍：

1. **主题**：是否同时适配 `theme-light` 与 `theme-dark`？
2. **材质**：浅色是否用 glass token / `.glass-*`，而不是实色卡片？
3. **背景**：页面/面板背景是否透明或半透，让最后面玻璃露出来？
4. **边与高光**：是否有细边 + 顶沿高光，而不是粗描边/无边色块？
5. **文字对比**：半透底上文字是否仍清晰（优先 `--text` / `--text-secondary`）？
6. **动效**：复用 `styles/motion.css` 时长与曲线；直播过程用 `.live-orb` / `.live-dot` / `.live-shimmer` 保持呼吸反馈；尊重 `prefers-reduced-motion`。
7. **硬编码**：是否避免写死仅浅色可用的颜色？

### 推荐写法

```tsx
// 卡片 / 浮层
<div className="glass-card">...</div>

// 或语义容器 + 主题 CSS
<section className="my-panel">...</section>
```

```css
/* 优先 token */
.my-panel {
  background: var(--glass-fill-raised);
  border: 0.5px solid var(--glass-edge);
  box-shadow: var(--glass-shadow-card), var(--glass-rim);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
}

/* 仅当 token 不够时，用 theme-light / theme-dark 微调，不要写死单主题 */
html.theme-light .my-panel { /* 可更透 */ }
html.theme-dark .my-panel { /* 金属面，无 blur */ }
```

## 5. 关键文件

| 文件 | 职责 |
|------|------|
| `src/styles/global.css` | 主题 token、浅色透玻璃壳层、深色金属 token |
| `src/styles/glass.css` | 共用 glass 组件材质 |
| `src/styles/motion.css` | 动效 |
| `src/App.tsx` | 根据 `uiTheme` 写 `theme-light` / `theme-dark` 与 CSS 变量 |
| `src/components/settings/AppearanceSettings.tsx` | 外观设置（仅两主题） |
| `electron/main/index.ts` | 窗口透明与 vibrancy（浅色）/ 实色（深色） |
| `shared/types.ts` | `uiTheme` / `uiGlass` 字段说明 |

## 6. 验收标准（浅色）

- 主区域 / 侧栏 **不是**一整块不透明白或灰
- 能感觉到环境/桌面透过（vibrancy 生效时）
- 输入框、设置卡片像控制中心磁贴：透 + 顶光 + 细边
- 新页面与旧页面放在一起，材质语言一致

## 7. 文档维护

- 改外观行为 → 更新本文档 + `src/ARCH.md`「样式」节
- 若改主题数量或材质定义 → 同步 `AGENTS.md` 必读列表中的入口说明

## 直播过程动效

- 始终显示当前步骤与呼吸灯（`.live-orb` / `.live-dot` / `live-panel-breathe`）
- 工具间隙显示「规划下一步」；仅在已有回答流时显示「生成回答」
- 主题色统一使用 CSS 变量（`--accent` / `--on-accent` 等），避免硬编码蓝/白
