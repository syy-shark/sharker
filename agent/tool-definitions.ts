/**
 * 供模型调用的工具 JSON Schema 定义（OpenAI function calling 格式）。
 * @see agent/README.md
 */
/** OpenAI function calling 格式的全部工具 Schema */
export const TOOL_DEFINITIONS = [
  /* —— 文件与目录 —— */
  {
    type: 'function' as const,
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
    type: 'function' as const,
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
    type: 'function' as const,
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
    type: 'function' as const,
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
    type: 'function' as const,
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
    type: 'function' as const,
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
    type: 'function' as const,
    function: {
      name: 'delete_path',
      description: 'Delete a file or directory',
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
    type: 'function' as const,
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
    type: 'function' as const,
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
  /* —— 终端 —— */
  {
    type: 'function' as const,
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
  /* —— Git —— */
  {
    type: 'function' as const,
    function: {
      name: 'git_status',
      description: 'Show git working tree status',
      parameters: { type: 'object', properties: { cwd: { type: 'string' } }, required: ['cwd'] }
    }
  },
  {
    type: 'function' as const,
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
    type: 'function' as const,
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
    type: 'function' as const,
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
    type: 'function' as const,
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
    type: 'function' as const,
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
    type: 'function' as const,
    function: {
      name: 'git_pull',
      description: 'Pull from remote',
      parameters: { type: 'object', properties: { cwd: { type: 'string' } }, required: ['cwd'] }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'git_push',
      description: 'Push to remote',
      parameters: { type: 'object', properties: { cwd: { type: 'string' } }, required: ['cwd'] }
    }
  },
  /* —— Skill 脚本 —— */
  {
    type: 'function' as const,
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
  }
]
