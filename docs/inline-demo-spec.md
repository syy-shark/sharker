# 内联可视化（Inline Demo）Harness 规范

> 本文是 **生成与渲染** 内联演示的强制规范。  
> 模型 system prompt（`agent/loop.ts`）与宿主（`InlineDemo` / `present_inline_demo`）均应对齐本文。  
> 改演示行为时同步改本文 + `docs/agent-capabilities.md`。

## 1. 定义

**内联可视化** = 嵌在聊天消息流里的自包含 HTML/CSS/JS 演示，用户**无需**打开系统浏览器、写磁盘网页或起本地服务器。

| 途径 | 说明 |
|------|------|
| 工具 `present_inline_demo` | **优先**：`html` + 可选 `caption`；参数流式拼接时 **边生成边预览**（`tool_preview`） |
| Markdown 围栏 | ` ```demo `（别名：`demo-html` / `visualization` / `viz` / `inline-demo`）；未闭合围栏在直播中也会渐进渲染 |

**不是**内联可视化：

- `write_file` 写出 `index.html` 再 `open_url` / localhost
- 过程流里的「文件预览卡片」
- 整段把对话外壳伪装成浏览器窗口

## 2. 版式与空白（Layout）

### 2.1 宽度与溢出

- 演示根节点宽度跟随聊天柱（约 ≤720px 内容区），**禁止**写死超大 `width` / `min-width` 导致横向撑破。
- 所有卡片 / 面板：`min-width: 0`、`overflow: hidden`（或至少 `overflow-wrap: anywhere`），**文字不得画出卡片外**。
- 图片 / 表格 / `pre`：`max-width: 100%`。

### 2.2 高度、完整展开与滚动条

- 内联演示在对话里 **完整展开**，**不要**在演示块内部出现滚动条。
- 宿主 iframe 高度跟随内容（无 640px 一类硬顶）；整块演示由用户 **展开 / 收起**（`.inline-demo-toggle`），而不是内部滚动。
- **禁止**用大 `min-height`（如 400px+ 空画布）撑出聊天里「演示下方一大片白」。
- 根 / 主卡片高度应 **由内容决定**；底部 padding 控制在约 8–16px。
- 生成侧不要写 `overflow: auto` + 固定高度的大滚动容器。

### 2.3 多栏布局（如 Git 三区）

- 使用 `display: flex` + `flex-wrap: wrap` 或 `grid`，子项 `flex: 1 1 Npx` + `min-width: 0`。
- **禁止**中间栏被挤成竖条、文字竖排溢出、三栏重叠。
- 窄宽时允许换行成 1 列，而不是重叠。

### 2.4 与正文的关系

- 助手**正文在上**、过程流在下（UI 已定）。
- 演示块与上下 Markdown 段落间距紧凑（宿主约 8–10px），不要演示底自己再留 80px+ 空 margin。

## 3. 交互（Interaction）

- 界面上能看见的步骤按钮（如「1. 改文件」「2. git add」）**必须可点且有效**：点击后更新三区状态、终端日志、提示条等。
- **禁止**摆设按钮（看得见、点了没反应）。
- 仅在「当前步骤尚未解锁」时可用 `disabled`，并有可见样式；默认应可点。
- 事件绑定写在同一段 HTML 内（`onclick` 或 `<script>`）；不要依赖外部文件。
- 假终端**日志区**可只读；命令行输入可选。不要把整页包进一个不可点的遮罩。

## 4. 假终端（Terminal block only）

假终端 = 演示**内部**的一小块 shell 日志，**不是**整个内联可视化。

### 4.1 做法

```html
<pre class="demo-terminal" data-term-title="shark@sharker — zsh — 80×24">
$ git status
modified: app.js
$ git add app.js
</pre>
```

- 宿主会给该块套 **macOS 三色灯 + 顶栏居中标题 + 深色窗体**。
- 可选玻璃：`class="demo-terminal demo-terminal-glass"` 或 `data-term-style="glass"`。

### 4.2 禁止

- 把**整个** Git 看板 / 三区卡片包进 Terminal 窗壳。
- 日志中间大段空白、`min-height` 占位槽、空 `div` 撑高。
- 命令与输出之间留多行空行（应：命令 → 紧接输出 → 下一命令）。

### 4.3 日志内容

- 点击步骤后，日志应**追加**可读行（可有颜色 span）。
- 字色与底对比足够（深底用浅字 / 语义色）。

## 5. 提交历史 / 次要面板

- 用**紧凑列表**：短 hash + message（可加 branch 标签）。
- 高度随条目增加；**禁止**固定超高空白 graph 只画一个点。
- 空状态写一句「暂无提交」，不要空白大卡片。

## 6. 材质与主题

- 浅色：贴近水滴玻璃（半透、细边）；深色：金属感。用宿主 CSS 变量，不要写死纯黑整页底（假终端窗体除外，由宿主套壳）。
- `body` 背景必须 **transparent**，融入聊天气泡流。

## 7. 文案配合

- 演示上方可有一句引导；下方可有一句总结。
- 不要在过程流已讲完后再贴长文复述。
- 演示与文字同一语言（用户用中文则演示 UI 用中文）。

## 7.1 公式（Math）

宿主会注入 **KaTeX**（CDN）并对 `\( \)` / `\[ \]` / `$...$` 自动排版；裸 LaTeX（如 `G_{\mu\nu}`）会尽量转成 Unicode。

生成侧优先：

| 推荐 | 避免 |
|------|------|
| Unicode：`G_μν + Λ g_μν = (8πG/c⁴) T_μν` | 表格单元格里堆未包裹的 `G_{\mu\nu}` |
| 或 `\(...\)` / `$...$` 包裹 LaTeX | 只写反斜杠命令当纯文本 |

## 8. 实现检查清单（生成前自检）

- [ ] 使用 `present_inline_demo` 或 ` ```demo `
- [ ] 无写文件 + 开浏览器
- [ ] 无超大 min-height / 底部大空白
- [ ] 卡片内文字不溢出
- [ ] 多栏不重叠、不挤成竖条
- [ ] 所有步骤按钮可点且改状态
- [ ] 假终端仅日志块 + 连续日志行
- [ ] 提交历史紧凑列表
- [ ] body 透明 + 宿主 CSS 变量
- [ ] 公式用 Unicode 或 `$...$` / `\(...\)`，不要裸堆 `G_{\mu\nu}` 当纯文本

## 9. 相关代码

| 位置 | 职责 |
|------|------|
| `tools/builtins/present-inline-demo.ts` | 工具执行 |
| `tools/schemas.ts` | 工具 schema |
| `agent/loop.ts` | system prompt 摘要 |
| `src/components/InlineDemo.tsx` | iframe 宿主主题、终端套壳、高度 |
| `src/components/MarkdownBody.tsx` | ` ```demo ` 渲染 |
| `shared/turn-segments.ts` | 回答流中交错文字 + 演示 |
