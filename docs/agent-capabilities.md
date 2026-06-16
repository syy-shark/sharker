# Sharker Agent 能力全景

模型负责「想」，Harness 负责「能稳定做完」。工具不多，但覆盖桌面开发的主路径。

## 调用方式（Turn 管线）

```
handlePromptSubmit（接待：排队 / 插队 / 直接派发）
  → executeUserInput（主进程调度）
  → queryServe（占坑 turn_start）
  → processUserInput（斜杠命令 or 进入模型）
  → onQuery：压缩上下文 + system + 工作区快照 + Skills + 历史
  → queryLoop：
      模型流式回复
      → 若有 tool_calls：审批 → 执行 → 结果塞回 messages → 再调模型（最多 12 轮）
      → 若本轮改过代码：自动 npm run test/build（一次）
      → 纯文本则结束
  → UI 展示思考 / 工具时间线
```

权限：`sandbox` 仅限工作区；`full` 可访问整机。高危操作弹窗确认。

### 斜杠命令（不走模型）

| 命令 | 作用 |
|------|------|
| `/help` | 显示能力与命令列表 |
| `/clear` | 清空当前对话 |

### 排队与插队

- Agent 忙时 **Enter** 默认将消息**排队**（UI 显示「排队中」，可取消）
- 当前 turn 结束后**自动按序**执行下一条
- **插队**：中止当前任务，将新消息置队首并立即执行

### 启动开发服务器

- `npm run dev`、`vite` 等命令会在捕获首包输出后**自动转后台**（约 8s），不再卡死整轮对话
- 点击**停止**会终止后台 dev server 进程

---

## 一、已有工具（现在就能用）

### 看 · 搜

| 工具 | 能做什么 |
|------|----------|
| `list_dir` | 列目录（可指定深度） |
| `glob_file_search` | 按文件名模式找文件 |
| `grep` | 在目录下搜文本（结果截断 200 行） |
| `read_file` | 读文件（支持 offset/limit） |

典型：读代码、找函数、摸清项目结构。

### 改 · 整理文件

| 工具 | 能做什么 |
|------|----------|
| `write_file` | 新建或整文件覆盖 |
| `search_replace` | 精确替换片段（改 bug 首选） |
| `delete_path` | 删文件/目录（递归删需确认） |
| `move_path` | 移动/重命名 |
| `create_directory` | 建目录 |

典型：改代码、整理项目内文档、重命名模块。  
**整理桌面**：把工作区指到 `~/Desktop` 或子文件夹，在 sandbox 内用上述工具 + 终端。

### 跑 · 命令

| 工具 | 能做什么 |
|------|----------|
| `run_terminal_cmd` | bash 执行任意命令（cwd 锁在工作区） |

典型：`npm install`、`python script.py`、压缩包、系统命令（full 模式下）。

### Git

| 工具 | 说明 |
|------|------|
| `git_status` / `git_diff` / `git_log` / `git_show` | 只读 |
| `git_add` | 暂存 |
| `git_commit` | 提交（需用户明确说 + 弹窗） |
| `git_pull` / `git_push` | 拉/推（弹窗确认） |

### Skills

| 工具 | 说明 |
|------|------|
| `run_skill_script` | 跑 `SKILL.md` 同目录下 `scripts/` 里的脚本 |

Skill 来源：`~/.sharker/skills/`、`<工作区>/.sharker/skills/`。按用户消息关键词匹配注入，最多 2 个。

---

## 二、Harness 已启用的策略

| 策略 | 作用 |
|------|------|
| 工作区快照 | 干活前注入 README、package.json、顶层目录 |
| 写代码纪律 | 先读后改、优先 search_replace |
| 工具输出截断 | 防止 grep/终端输出撑爆上下文 |
| 上下文压缩 | 用量超 85% 自动摘要旧消息 |
| 自动验证 | 改代码后自动 `npm run test/build/lint`（每轮一次） |
| needs-tools | 「你好」类短句不带 tools，省 token |

---

## 三、场景对照

| 你想做的事 | 靠什么 |
|------------|--------|
| 写/改项目代码 | read → search_replace → 自动 verify |
| 查 bug、读逻辑 | grep + read_file |
| 跑测试/构建 | run_terminal_cmd 或自动 verify |
| 整理桌面文件 | 工作区设到桌面 + move/delete/write |
| 批量重命名 | move_path 或终端 `mv` |
| 提交代码 | 你说「提交」→ git_add + git_commit |
| 写脚本自动化 | run_terminal_cmd + Skills |
| 纯聊天/问答 | 无 tools，直接答 |

---

## 四、后续 Worth Doing（未实现）

| 能力 | 价值 |
|------|------|
| `.sharker/AGENTS.md` 项目规则 | 像 CLAUDE.md，每个仓库定制行为 |
| `apply_patch` 增强编辑 | 降低 old_string 对不上的失败率 |
| 探索/编辑分阶段 | 探索期只开读工具，减少误写 |
| 编辑快照/撤销 | 改坏了能回滚 |
| 并行只读工具 | 加快 grep+read |
| Plan 模式 | 大任务先列步骤再执行 |
| 桌面 full 模式快捷整理 | 明确 UI 提示「当前可访问整机」 |

---

## 五、你怎么用才最顺

1. **工作区选对**：写代码指到仓库根；整理桌面指到桌面或子文件夹。
2. **权限**：默认 sandbox；要动系统其它目录再开 full。
3. **说清楚目标**：「修 X 文件的 Y bug」比「看看」更省轮次。
4. **提交/推送**：口头说清楚，否则会拦。
5. **不想自动跑命令**：说「不要运行」可跳过自动 verify。
