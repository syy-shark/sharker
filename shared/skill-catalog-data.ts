/**
 * Skill 目录纯数据：内置（随应用分发）+ 可安装市场项。
 * @see skills/README.md
 */

/** Skill 目录项 */
export interface SkillCatalogEntry {
  id: string
  title: string
  description: string
  tags?: string[]
  /** 随 Sharker 内置，无需安装 */
  bundled?: boolean
  /** GitHub 克隆地址（市场项） */
  repoUrl?: string
}

/** 内置 Skill（类似 Cursor skills-cursor，开箱即用） */
export const BUNDLED_SKILL_CATALOG: SkillCatalogEntry[] = [
  {
    id: 'code-review',
    title: 'Code Review',
    description: '结构化代码审查：风险、回归、测试缺口与改进建议。',
    tags: ['内置', '开发'],
    bundled: true
  },
  {
    id: 'create-rule',
    title: 'Create Rule',
    description: '编写 .cursor/rules 或 AGENTS.md 项目规则。',
    tags: ['内置', '规则'],
    bundled: true
  },
  {
    id: 'debug',
    title: 'Debug',
    description: '系统化排查：复现、假设、日志、最小修复。',
    tags: ['内置', '调试'],
    bundled: true
  },
  {
    id: 'docs-writer',
    title: 'Docs Writer',
    description: 'README、架构说明与 API 文档写作规范。',
    tags: ['内置', '文档'],
    bundled: true
  },
  {
    id: 'git-commit',
    title: 'Git Commit',
    description: '撰写清晰、可审查的 commit message 与 PR 摘要。',
    tags: ['内置', 'Git'],
    bundled: true
  },
  {
    id: 'canvas',
    title: 'Canvas',
    description: '复杂分析、表格、图表类交付用 Canvas 呈现。',
    tags: ['内置', '可视化'],
    bundled: true
  }
]

/** 可安装 Skill 市场 */
export const MARKETPLACE_SKILL_CATALOG: SkillCatalogEntry[] = [
  {
    id: 'anthropic-document-skills',
    title: 'Document Skills',
    description: 'Anthropic 官方：PDF、Word、Excel、PowerPoint 文档处理。',
    repoUrl: 'https://github.com/anthropics/skills',
    tags: ['官方', 'Office']
  },
  {
    id: 'anthropic-example-skills',
    title: 'Example Skills',
    description: 'Anthropic 12+ 示例：MCP 构建、视觉设计、Skill 创作等。',
    repoUrl: 'https://github.com/anthropics/skills',
    tags: ['官方', '示例']
  },
  {
    id: 'frontend-design',
    title: 'Frontend Design',
    description: '高质量 UI/UX 与组件设计指引。',
    repoUrl: 'https://github.com/anthropics/skills',
    tags: ['前端']
  },
  {
    id: 'pdf-processing',
    title: 'PDF Processing',
    description: '表单提取、合并拆分、OCR 与 PDF 自动化。',
    repoUrl: 'https://github.com/anthropics/skills',
    tags: ['Office']
  },
  {
    id: 'mcp-builder',
    title: 'MCP Builder',
    description: '创建 MCP Server 与 JSON Schema 工具定义。',
    repoUrl: 'https://github.com/anthropics/skills',
    tags: ['MCP']
  },
  {
    id: 'skill-creator',
    title: 'Skill Creator',
    description: '编写符合 agentskills.io 标准的 Skill。',
    repoUrl: 'https://github.com/anthropics/skills',
    tags: ['教程']
  },
  {
    id: 'web-artifacts',
    title: 'Web Artifacts',
    description: '交互式 HTML/React 产物与原型。',
    repoUrl: 'https://github.com/anthropics/skills',
    tags: ['前端']
  },
  {
    id: 'claude-api-docs',
    title: 'Claude API Docs',
    description: 'Claude API、SDK 与 Agent 最佳实践参考。',
    repoUrl: 'https://github.com/anthropics/skills',
    tags: ['API']
  },
  {
    id: 'test-driven-dev',
    title: 'Test Driven Dev',
    description: '测试驱动开发与回归测试策略。',
    repoUrl: 'https://github.com/anthropics/skills',
    tags: ['测试']
  },
  {
    id: 'security-review',
    title: 'Security Review',
    description: '变更集安全审查与威胁建模要点。',
    repoUrl: 'https://github.com/anthropics/skills',
    tags: ['安全']
  }
]
