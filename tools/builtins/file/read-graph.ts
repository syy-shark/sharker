/**
 * read_graph：读取 mermaid / dot / 图结构 JSON。
 * @see tools/README.md
 */
import fs from 'fs/promises'
import path from 'path'
import { assertAccess, ok } from '../../context'
import { normalizePath } from '../../permissions'
import type { ToolHandler } from '../../types'

const GRAPH_EXT = new Set(['.mmd', '.mermaid', '.dot', '.gv', '.graphml', '.json'])

export const readGraphTool: ToolHandler = {
  name: 'read_graph',
  title: '读取图表',
  extractPaths: (args) => [String(args.path)],
  async execute(args, ctx) {
    const p = normalizePath(String(args.path))
    assertAccess(ctx, p)
    const ext = path.extname(p).toLowerCase()
    const base = path.basename(p).toLowerCase()
    if (!GRAPH_EXT.has(ext) && !base.includes('graph')) {
      throw new Error('Expected .mmd/.mermaid/.dot/.graphml or *graph*.json')
    }
    const content = await fs.readFile(p, 'utf8')
    if (ext === '.json') {
      try {
        const json = JSON.parse(content)
        return ok(`Graph JSON ${p}:\n${JSON.stringify(json, null, 2).slice(0, 50_000)}`)
      } catch {
        return ok(content)
      }
    }
    const lines = content.split('\n')
    const offset = Number(args.offset ?? 1) - 1
    const limit = args.limit ? Number(args.limit) : lines.length
    return ok(
      lines
        .slice(offset, offset + limit)
        .map((l, i) => `L${offset + i + 1}: ${l}`)
        .join('\n')
    )
  }
}
