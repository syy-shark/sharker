# Sharker

Ubuntu 桌面 AI 助手（Electron + React + TypeScript）。

## 文档（开发前请先读）

| 入口 | 说明 |
|------|------|
| [docs/README.md](docs/README.md) | **文档索引**（全局 + 各模块） |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 系统架构 |
| [docs/roadmap-harness.md](docs/roadmap-harness.md) | Harness 路线图 |
| [AGENTS.md](AGENTS.md) | 给 AI / 协作者的本仓库说明 |

各模块目录均有 `README.md`：`agent/`、`tools/`、`src/`、`electron/`、`shared/`、`providers/`、`skills/`。

## 开发

```bash
npm install
npm run dev
```

## 首次使用

1. 打开 **设置**，选择 **工作区** 文件夹
2. 配置 **OpenAI 兼容** API（Base URL、API Key、模型 ID）
3. 在对话中提问；涉及高危操作时会弹窗确认

## Skill

- 全局：`~/.sharker/skills/<name>/SKILL.md`
- 项目：`<工作区>/.sharker/skills/<name>/SKILL.md`
- 设置中可从 GitHub 仓库导入

## 构建

```bash
npm run build
```
