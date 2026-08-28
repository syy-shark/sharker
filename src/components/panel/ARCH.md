# src/components/panel — 右侧面板内容

## 职责

- 文件树、**变更（git）**、集成终端、**内置浏览器**、**子 Agent 活动**五个 Tab 的内容区
- 由上层 [`RightPanel.tsx`](../RightPanel.tsx) 挂载；本目录不负责面板壳（宽、全屏、Tab 切换）
- **不管**：系统默认浏览器（`open_url`）、无头 `browser_*`（Playwright）、Chrome 扩展 host

## 同级目录

（无子目录）

## 同级文件

| 文件 | 说明 |
|------|------|
| `FileTree.tsx` / `.css` | 工作区文件树；附加文件夹与主根并列顶层（对标 Codex Edit project）；打开预览 view-enter 并可跳到引用行（附加根按目录名前缀解析）；文本预览聚焦时 ⌘L 打开玻璃跳行框（对标 Codex Go to line，不抢输入框 / 浏览器地址栏）；图 / PDF 走 data URL，办公二进制不灌进文本；长行换行以免撑开面板；文本预览划选可插入输入框或旁路提问（对标 Codex Project Preview selection actions）；`previewRequest.token` 在 Agent 写完同一文件后递增并重读（对标 Codex 打开的文档跟着改）；子目录展开 list-item-in |
| `ChangesPanel.tsx` / `.css` | Git 变更审查：未提交 / 本轮 / 分支 / 指定 commit（对标 Codex Commit）、未暂存/已暂存、文件/hunk 暂存还原、提交/推送/创建 PR、detached 上创建分支（占位显示 Settings 前缀）、行内评论 + `/review` 发现 + GitHub PR 评论挂到 diff，本地评论可发布到 GitHub；点文件名打开右侧预览、点行背景展开/收起（可同时展开多个文件）、顶栏「展开全部 / 收起全部」（对标 Codex expand or collapse all diffs）、⌘单击行跳预览（对标 Codex Review pane，不用外部默认编辑器）；已展开 diff 且面板聚焦时 ⌘L 打开跳行框并打开该文件预览（对标 Codex Go to line）；「换行」切换长 diff 换行（写入 localStorage）；`revision` 随工具写盘刷新；附加文件夹里不同 Git 仓库出顶栏仓库选择器（本轮默认全部仓库 + 每仓 +/-，未暂存/分支/提交只作用于选中仓）；项目还不是仓库时提示并一键 `git init`（对标 Codex Review create a repository） |
| `EmbeddedTerminal.tsx` / `.css` | 集成终端；按线程缓存最多 6 个会话，线程内最多 8 个标签（对标 Codex terminal tabs per thread）；新对话 pending 窗格收成真实 id 时不另开 PTY；切对话 / 右侧 Tab 不杀 PTY；输出尾给 `read_thread_terminal`；可接收 Composer `!` 待执行命令（写入当前标签）；`clearTick` / 清屏只清当前标签；终端聚焦时 ⌘K / Ctrl+K 也清屏（⌘⇧P 仍开命令面板）；划选输出出「插入输入框 / 旁路提问」（对标 Codex send selection to composer 与 Ask in side chat）；字号跟 `--code-font-scale`，字体跟 `--mono`（Code font） |
| `EmbeddedBrowser.tsx` / `.css` | 内置浏览器；起始页主题跟随 App；避免 data URL 自激 reload |
| `AgentsPanel.tsx` / `.css` | 当前线程的子 Agent：进行中/已结束、直播正文、停止、转向；主线程点开时选中对应孩子 |
| `browser-start-page.ts` | 新标签起始页 HTML（data URL）；跟随 App light/dark，仅 Logo + 搜索 |
| `browser-glass-css.ts` | 访客页水滴玻璃注入 CSS（Dark Reader 式 `insertCSS`）+ 是否注入判断 |
| `ARCH.md` | 本层架构说明 |

## 内置浏览器（EmbeddedBrowser）

### 行为摘要

| 项 | 说明 |
|----|------|
| 默认页 | **本地新标签**（`browserStartPageDataUrl()`），**不**默认打开 google.com 营销页 |
| 工具栏 | 后退 / 前进 / 刷新 · 一条 omnibox ·「主页」回新标签 |
| Omnibox | Enter：像 Chrome——带点当网址，否则 Google 搜索；聚焦浏览器时 ⌘L 选中地址栏、⌘R / ⌘⇧R 刷新、⌘← / ⌘→ 前进后退、⌘⇧C 复制网址、鼠标侧键导航 |
| 视口 | `<webview>` **absolute 铺满**（`height:100%` 会裁切半截页）；宿主视口背景透明以透玻璃 |
| 起始页玻璃 | 起始 HTML 自带半透搜索框 + 透明底；主题跟随 App `theme-light/dark`（非系统偏好） |
| 外站玻璃 | `http(s)` 在 `dom-ready` / 导航后 `insertCSS(PAGE_GLASS_INJECT_CSS)`；失败忽略 |
| 缓存 | 改起始页须递增 `BROWSER_START_PAGE_VERSION`，并用 webview `key` 迫使重建 |
| 快捷方式 | **暂不展示**；以后可在起始页搜索框下加一排圆标，末尾「+ 添加」 |
| 切标签 | 单页 webview，无多标签；聚焦时 ⌃Tab / ⌃⇧Tab 不切侧栏对话（对标 Codex「chat or tab」） |

### 依赖

- Electron `webviewTag: true`（见 `electron/main`）
- 上层：`RightPanel` 全屏时 `body.right-panel-fullscreen` 隐藏侧栏/主区，避免叠字

### 扩展点

| 需求 | 改哪里 |
|------|--------|
| 改新标签样式 / 布局 | `browser-start-page.ts` + 递增 `BROWSER_START_PAGE_VERSION` |
| 加快捷方式 /「+」 | `buildBrowserStartPageHtml()` 内恢复 `.shortcuts`，数据可后续落 localStorage |
| 调外站玻璃强度 | `browser-glass-css.ts` 的 `PAGE_GLASS_INJECT_CSS` |
| 关闭玻璃注入 | `shouldInjectGlass` 恒 false，或去掉 `applyPageGlass` 调用 |
| 默认打开某 URL | `<EmbeddedBrowser initialUrl="…" />` |

### 与相关模块

| 模块 | 关系 |
|------|------|
| `RightPanel.tsx` | Tab=`browser` 时渲染本组件；全屏防叠字策略在壳层 |
| `tools/builtins/browser` / `open_url` | **不同路径**：自动化/系统浏览器，不是本面板 |
| [docs/ui-style.md](../../../docs/ui-style.md) | 浅色水滴玻璃 / 深色金属；浏览器壳与注入应对齐 token |

> 本层交互控件补齐 `:focus-visible` 与 `prefers-reduced-motion` 收敛。
