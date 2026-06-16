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

```
~/.sharker/skills/<name>/SKILL.md
<workspace>/.sharker/skills/<name>/SKILL.md
```

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
