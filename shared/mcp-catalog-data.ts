/**
 * MCP 插件目录纯数据（渲染进程可安全 import，不依赖 Node）。
 * @see shared/plugin-catalog.ts
 */

/** MCP Server 配置片段（写入 mcp.json） */
export interface McpCatalogServerTemplate {
  name: string
  command: string
  args?: string[]
  env?: Record<string, string>
  transport?: 'content-length' | 'ndjson'
}

/** MCP 插件目录项 */
export interface McpCatalogItem {
  id: string
  title: string
  description: string
  serverName: string
  category: 'recommended' | 'more'
  feature?: 'computerUse' | 'browserUse'
  /** 静态模板；动态路径（workspace、candidate binary）由主进程填充 */
  template: McpCatalogServerTemplate
}

/** 内置 MCP 目录（Cursor 风格市场列表） */
export const MCP_CATALOG: McpCatalogItem[] = [
  {
    id: 'filesystem',
    title: 'Filesystem',
    description: '读写工作区内的文件与目录。',
    serverName: 'filesystem',
    category: 'recommended',
    template: {
      name: 'filesystem',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '{{workspace}}']
    }
  },
  {
    id: 'cua-driver',
    title: 'cua-driver (推荐)',
    description: 'Cua Driver：Windows/macOS 后台 UI 自动化（UIA/AT-SPI），元素级点击与窗口状态，不抢焦点。',
    serverName: 'cua-driver',
    category: 'recommended',
    feature: 'computerUse',
    template: {
      name: 'cua-driver',
      command: '{{cua_driver_binary}}',
      args: ['mcp']
    }
  },
  {
    id: 'computer-use',
    title: 'Computer Use (Codex)',
    description: 'codex-computer-use-linux：AT-SPI、portal 截图与窗口聚焦。',
    serverName: 'computer-use',
    category: 'more',
    feature: 'computerUse',
    template: {
      name: 'computer-use',
      command: '{{codex_binary}}',
      args: ['mcp'],
      transport: 'ndjson'
    }
  },
  {
    id: 'playwright',
    title: 'Playwright',
    description: '浏览器自动化：导航、快照、点击与填表。',
    serverName: 'playwright',
    category: 'recommended',
    feature: 'browserUse',
    template: {
      name: 'playwright',
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest']
    }
  },
  {
    id: 'git',
    title: 'Git',
    description: '查看 diff、log，管理 Git 仓库。',
    serverName: 'git',
    category: 'recommended',
    template: {
      name: 'git',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-git', '--repository', '{{workspace}}']
    }
  },
  {
    id: 'fetch',
    title: 'Web Fetch',
    description: '抓取并解析网页内容。',
    serverName: 'fetch',
    category: 'recommended',
    template: {
      name: 'fetch',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-fetch']
    }
  },
  {
    id: 'github',
    title: 'GitHub',
    description: 'Issues、PR、仓库搜索与文件读取。',
    serverName: 'github',
    category: 'more',
    template: {
      name: 'github',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github']
    }
  },
  {
    id: 'brave-search',
    title: 'Brave Search',
    description: '联网搜索（需 BRAVE_API_KEY 环境变量）。',
    serverName: 'brave-search',
    category: 'more',
    template: {
      name: 'brave-search',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-brave-search']
    }
  },
  {
    id: 'sqlite',
    title: 'SQLite',
    description: '查询本地 SQLite 数据库。',
    serverName: 'sqlite',
    category: 'more',
    template: {
      name: 'sqlite',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sqlite', '--db-path', '{{workspace}}/data.db']
    }
  },
  {
    id: 'memory',
    title: 'Memory',
    description: '跨会话持久化知识图谱式记忆。',
    serverName: 'memory',
    category: 'more',
    template: {
      name: 'memory',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory']
    }
  },
  {
    id: 'sequential-thinking',
    title: 'Sequential Thinking',
    description: '分步推理与思考链工具。',
    serverName: 'sequential-thinking',
    category: 'more',
    template: {
      name: 'sequential-thinking',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sequential-thinking']
    }
  }
]
