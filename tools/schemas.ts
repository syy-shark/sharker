/**
 * 全部 Tool 的 OpenAI JSON Schema（纯数据，主进程与渲染进程均可 import）。
 * 各 builtin 模块负责 execute；此处负责模型可见的 schema。
 * @see tools/ARCH.md
 */
import type { OpenAIToolDefinition } from './types'
import { EXTENDED_TOOL_DEFINITIONS } from './schemas-extended'

/** 核心 Tool Schema */
const CORE_TOOL_DEFINITIONS: OpenAIToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description: 'List files and directories in a path',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path' },
          depth: { type: 'number', description: 'Max depth (default 1)' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'glob_file_search',
      description: 'Find files matching a glob pattern under a directory',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string' },
          cwd: { type: 'string' }
        },
        required: ['pattern', 'cwd']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'grep',
      description: 'Search for text in files under a directory',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string' },
          path: { type: 'string' },
          glob: { type: 'string' }
        },
        required: ['pattern', 'path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read file contents, optionally with line range',
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
      name: 'write_file',
      description: 'Create or overwrite a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'present_inline_demo',
      description:
        'Embed a self-contained interactive HTML/CSS/JS demo directly inside the chat message stream (conversation-native visualization). Use this when the user asks to demonstrate, show, illustrate, or 演示 a concept/UI/algorithm. Do NOT write an HTML file and open a browser for demos — call this instead. Prefer host CSS variables: --text, --accent, --surface, --border, transparent background.',
      parameters: {
        type: 'object',
        properties: {
          html: {
            type: 'string',
            description:
              'Self-contained HTML fragment or document (inline CSS/JS ok). Transparent body; use host CSS variables when possible.'
          },
          caption: {
            type: 'string',
            description: 'Optional short caption shown above the demo'
          }
        },
        required: ['html']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_replace',
      description: 'Replace old_string with new_string in a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          old_string: { type: 'string' },
          new_string: { type: 'string' },
          replace_all: { type: 'boolean' }
        },
        required: ['path', 'old_string', 'new_string']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_path',
      description:
        'Delete a file or directory. After recursive delete, harness auto-verifies the path is gone and reports STILL EXISTS if not.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          recursive: { type: 'boolean' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'uninstall_application',
      description:
        'Fully uninstall a macOS application: stop processes, brew uninstall --cask when applicable, remove .app bundles, delete ~/Library user data, and verify. Use for "删掉/卸载 XX" instead of manual rm -rf. Requires user approval.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'App keyword, e.g. steam' },
          remove_packages: {
            type: 'boolean',
            description: 'Remove Homebrew casks (default true)'
          },
          remove_user_data: {
            type: 'boolean',
            description: 'Delete user data directories (default true)'
          },
          extra_paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Additional paths to delete'
          }
        },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'verify_removal',
      description:
        'Verify an app or paths are fully removed: checks dirs, brew casks, processes, .app bundles. Harness may auto-run after deletes.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'App keyword, e.g. steam' },
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Explicit paths to check (optional if name given)'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'move_path',
      description: 'Move or rename a file or directory',
      parameters: {
        type: 'object',
        properties: {
          source: { type: 'string' },
          destination: { type: 'string' }
        },
        required: ['source', 'destination']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_directory',
      description: 'Create a directory',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          recursive: { type: 'boolean' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_terminal_cmd',
      description:
        'Run a shell command in the workspace. Dev servers (npm run dev, vite, etc.) auto-background after ~8s — do not wait for them to exit. Use block_until_ms for custom wait time in ms.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string' },
          cwd: {
            type: 'string',
            description: 'Working directory; must be the workspace path or a subdirectory'
          },
          block_until_ms: {
            type: 'number',
            description:
              'Max ms to wait for output before backgrounding (default 30000; dev servers ~8000)'
          }
        },
        required: ['command', 'cwd']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_thread_terminal',
      description:
        'Read the current chat’s integrated terminal snapshot (active tab). Use this to inspect a running dev server or build output instead of asking the user to paste it.',
      parameters: {
        type: 'object',
        properties: {
          max_chars: {
            type: 'number',
            description: 'Max characters of output tail (default 8000)'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_status',
      description: 'Show git working tree status',
      parameters: { type: 'object', properties: { cwd: { type: 'string' } }, required: ['cwd'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_diff',
      description: 'Show git diff',
      parameters: {
        type: 'object',
        properties: {
          cwd: { type: 'string' },
          staged: { type: 'boolean' },
          path: { type: 'string' }
        },
        required: ['cwd']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_log',
      description: 'Show git commit log',
      parameters: {
        type: 'object',
        properties: { cwd: { type: 'string' }, limit: { type: 'number' } },
        required: ['cwd']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_show',
      description: 'Show a specific git commit',
      parameters: {
        type: 'object',
        properties: { cwd: { type: 'string' }, ref: { type: 'string' } },
        required: ['cwd', 'ref']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_add',
      description: 'Stage files for commit',
      parameters: {
        type: 'object',
        properties: { cwd: { type: 'string' }, paths: { type: 'array', items: { type: 'string' } } },
        required: ['cwd', 'paths']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_commit',
      description: 'Create a git commit. Only when user explicitly asked to commit.',
      parameters: {
        type: 'object',
        properties: { cwd: { type: 'string' }, message: { type: 'string' } },
        required: ['cwd', 'message']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_pull',
      description: 'Pull from remote',
      parameters: { type: 'object', properties: { cwd: { type: 'string' } }, required: ['cwd'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_push',
      description: 'Push to remote',
      parameters: { type: 'object', properties: { cwd: { type: 'string' } }, required: ['cwd'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_skill_script',
      description: 'Run a script from an installed skill scripts folder',
      parameters: {
        type: 'object',
        properties: {
          skillPath: { type: 'string' },
          script: { type: 'string' },
          args: { type: 'array', items: { type: 'string' } }
        },
        required: ['skillPath', 'script']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_skills',
      description: 'List installed skills available to the agent',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_skill',
      description: 'Read a skill SKILL.md by name',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name']
      }
    }
  }
]

/** OpenAI function calling 格式的全部工具 Schema */
export const TOOL_DEFINITIONS: OpenAIToolDefinition[] = [
  ...CORE_TOOL_DEFINITIONS,
  ...EXTENDED_TOOL_DEFINITIONS
]

/** 全部已知工具名 */
export const KNOWN_TOOL_NAMES = new Set(TOOL_DEFINITIONS.map((t) => t.function.name))

/** 工具名 → Schema */
export const TOOL_SCHEMA_MAP = new Map(TOOL_DEFINITIONS.map((d) => [d.function.name, d]))
