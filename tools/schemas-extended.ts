/**
 * 扩展 Tool Schema（Phase 2+），由 schemas.ts 合并导出。
 * @see tools/README.md
 */
import type { OpenAIToolDefinition } from './types'

export const EXTENDED_TOOL_DEFINITIONS: OpenAIToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'apply_patch',
      description: 'Apply a multi-hunk patch (*** Update File / + - lines format)',
      parameters: {
        type: 'object',
        properties: { patch: { type: 'string', description: 'Full patch text' } },
        required: ['patch']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_pdf',
      description: 'Extract text from PDF with optional line range',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          offset: { type: 'number' },
          limit: { type: 'number' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_image',
      description: 'Read image file metadata and base64 preview',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_graph',
      description: 'Read mermaid/dot/graphml/graph JSON files with line range',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          offset: { type: 'number' },
          limit: { type: 'number' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_notebook',
      description: 'Read Jupyter .ipynb cells',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' }, cell_index: { type: 'number' } },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_notebook',
      description: 'Edit ipynb cell: replace, insert, or delete',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          cell_index: { type: 'number' },
          action: { type: 'string', enum: ['replace', 'insert', 'delete'] },
          new_source: { type: 'string' },
          cell_type: { type: 'string', enum: ['code', 'markdown', 'raw'] }
        },
        required: ['path', 'cell_index', 'action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'enter_plan_mode',
      description: 'Enter read-only plan mode (like Cursor Plan). Research then exit_plan_mode.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'exit_plan_mode',
      description: 'Exit plan mode and submit plan markdown for user Build',
      parameters: {
        type: 'object',
        properties: {
          plan_document: { type: 'string' },
          plan_file_path: { type: 'string' }
        },
        required: ['plan_document']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_worktree_add',
      description: 'git worktree add',
      parameters: {
        type: 'object',
        properties: {
          cwd: { type: 'string' },
          path: { type: 'string' },
          branch: { type: 'string' }
        },
        required: ['cwd', 'path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_worktree_list',
      description: 'git worktree list',
      parameters: { type: 'object', properties: { cwd: { type: 'string' } }, required: ['cwd'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_worktree_remove',
      description: 'git worktree remove',
      parameters: {
        type: 'object',
        properties: { cwd: { type: 'string' }, path: { type: 'string' } },
        required: ['cwd', 'path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'enter_worktree',
      description: 'Set harness cwd overlay to a worktree path',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'exit_worktree',
      description: 'Clear worktree cwd overlay',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'task_create',
      description: 'Create a background task (shell command or placeholder)',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          command: { type: 'string' },
          cwd: { type: 'string' }
        },
        required: ['title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'task_update',
      description: 'Update task title/description',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' }
        },
        required: ['task_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'task_get',
      description: 'Get task metadata',
      parameters: {
        type: 'object',
        properties: { task_id: { type: 'string' } },
        required: ['task_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'task_list',
      description: 'List all background tasks',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'task_output',
      description: 'Get task output (tail lines)',
      parameters: {
        type: 'object',
        properties: { task_id: { type: 'string' }, tail_lines: { type: 'number' } },
        required: ['task_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'task_stop',
      description: 'Stop a running task',
      parameters: {
        type: 'object',
        properties: { task_id: { type: 'string' } },
        required: ['task_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_background_shell',
      description: 'Run shell in background, returns task_id',
      parameters: {
        type: 'object',
        properties: { command: { type: 'string' }, cwd: { type: 'string' } },
        required: ['command', 'cwd']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'shell_read_output',
      description: 'Read background shell output by task_id',
      parameters: {
        type: 'object',
        properties: { task_id: { type: 'string' }, tail_lines: { type: 'number' } },
        required: ['task_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'shell_kill',
      description: 'Kill background shell by task_id',
      parameters: {
        type: 'object',
        properties: { task_id: { type: 'string' } },
        required: ['task_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'web_fetch',
      description: 'Fetch URL content as text',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string' } },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Web search (DuckDuckGo instant answers)',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'open_url',
      description:
        'Open a URL for the user in the system browser. Use this when the user asks to open a website or specifically says "用 Chrome 打开"; do not use headless browser_navigate for visible browsing.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'http(s) URL; https:// is added if omitted' },
          browser: {
            type: 'string',
            description: 'default | chrome. Use chrome only when the user explicitly asks for Chrome.'
          }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_skills',
      description: 'List installed skills',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_skill',
      description: 'Read SKILL.md body by name',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'desktop_doctor',
      description:
        'Diagnose Ubuntu desktop automation readiness (ydotool, screenshot tools, uinput). Background virtual input does not steal physical mouse.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'desktop_screenshot',
      description: 'Capture full desktop screenshot to workspace .sharker/desktop/',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'desktop_click',
      description:
        'Click at screen coordinates via ydotool virtual pointer (non-intrusive; physical mouse stays put)',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
          button: { type: 'string', description: 'left | right | middle' },
          count: { type: 'number', description: 'click repeat count' }
        },
        required: ['x', 'y']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'desktop_type',
      description: 'Type text via ydotool virtual keyboard',
      parameters: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'desktop_key',
      description: 'Send key chord via ydotool (e.g. 29:1 29:0 for Ctrl)',
      parameters: {
        type: 'object',
        properties: { key: { type: 'string' } },
        required: ['key']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'desktop_list_windows',
      description: 'List open windows (wmctrl/hyprctl; full AT-SPI via codex-computer-use-linux MCP)',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'desktop_get_ui_tree',
      description:
        'AT-SPI UI tree stub; reports bus status and points to MCP get_app_state when codex-computer-use-linux is configured',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'desktop_scroll',
      description:
        'Scroll via ydotool key fallback (Page/Arrow); for pixel-accurate scroll use MCP scroll after configuring codex-computer-use-linux',
      parameters: {
        type: 'object',
        properties: {
          direction: { type: 'string', description: 'up | down | left | right' },
          units: { type: 'number', description: 'repeat count (default 3, max 20)' },
          x: { type: 'number', description: 'optional pointer X before scroll' },
          y: { type: 'number', description: 'optional pointer Y before scroll' }
        },
        required: ['direction']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_navigate',
      description: 'Open URL in headless Chromium (requires playwright)',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string' } },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_snapshot',
      description: 'Accessibility-style snapshot of current or new page',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string', description: 'Optional URL to navigate first' } }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_click',
      description: 'Click element by CSS selector',
      parameters: {
        type: 'object',
        properties: { selector: { type: 'string' } },
        required: ['selector']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_type',
      description: 'Fill input by CSS selector',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string' },
          text: { type: 'string' }
        },
        required: ['selector', 'text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_screenshot',
      description: 'Save page screenshot to path',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          full_page: { type: 'boolean' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_close',
      description: 'Close headless browser session',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'voice_read_aloud',
      description: 'Read text aloud via spd-say/espeak or MCP read-aloud',
      parameters: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'voice_stop',
      description: 'Stop current TTS playback',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'mcp_list_tools',
      description: 'List configured MCP servers and their tools (stdio JSON-RPC)',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'mcp_call_tool',
      description: 'Call an MCP tool on a configured server',
      parameters: {
        type: 'object',
        properties: {
          server: { type: 'string' },
          tool_name: { type: 'string' },
          arguments: { type: 'object' }
        },
        required: ['server', 'tool_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'agent_spawn',
      description: 'Spawn a sub-agent with an independent task prompt',
      parameters: {
        type: 'object',
        properties: { prompt: { type: 'string' } },
        required: ['prompt']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'agent_send_message',
      description: 'Send follow-up message to spawn related sub-agent',
      parameters: {
        type: 'object',
        properties: { agent_id: { type: 'string' }, message: { type: 'string' } },
        required: ['agent_id', 'message']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'agent_get_result',
      description: 'Poll sub-agent result',
      parameters: {
        type: 'object',
        properties: { agent_id: { type: 'string' } },
        required: ['agent_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'agent_list',
      description: 'List sub-agents',
      parameters: { type: 'object', properties: {} }
    }
  }
]
