# skills — 可扩展技能

## 职责

- 从磁盘发现 `SKILL.md`（gray-matter  frontmatter）
- 按用户消息 **关键词匹配** 选择 Skill（最多 2 个，无匹配不注入）
- 拼进 system prompt；支持 `scripts/` 下脚本经 `run_skill_script` 执行

## 关键文件

| 文件 | 说明 |
|------|------|
| `loader.ts` | `loadSkills`、`selectSkillsForMessage`、`buildSkillsSystemPrompt`、`cloneSkillRepo` |

## Skill 目录约定

按优先级发现（同名时先发现的生效）：

1. `<workspace>/.claude/skills/<name>/SKILL.md` — 项目 Claude Code
2. `~/.claude/skills/<name>/SKILL.md` — 全局 Claude Code
3. `<workspace>/.sharker/skills/<name>/SKILL.md` — 项目 Sharker
4. `~/.sharker/skills/<name>/SKILL.md` — 全局 Sharker

`.claude` 与 Claude Code 目录结构兼容；GitHub 导入仍写入 `~/.sharker/skills/`。

`SKILL.md` 含 YAML frontmatter（`name`、`description`）+ Markdown 正文。

## 对外接口

- `loadSkills(workspace): Promise<SkillInfo[]>`
- `selectSkillsForMessage(skills, userMessage): SkillInfo[]`
- `buildSkillsSystemPrompt(skills, userMessage): string`

## 扩展指南

- 改匹配逻辑：`selectSkillsForMessage`
- 自进化生成 Skill 草稿：路线图 Phase 3，将写入此目录

## 文档

- 用户说明见根 [README.md](../README.md) Skill 一节
