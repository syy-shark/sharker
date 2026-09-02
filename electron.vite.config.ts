/**
 * Electron-Vite 构建配置：主进程、preload、React 渲染进程三端打包。
 * @see docs/ARCHITECTURE.md
 */
import { cpSync, existsSync, mkdirSync } from 'fs'
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

/** 构建时将 resources/icon.png 复制到主进程输出目录 */
function copyAppIconPlugin(): Plugin {
  const iconSrc = resolve('resources/icon.png')
  const copy = () => {
    if (!existsSync(iconSrc)) return
    const outDir = resolve('out/main')
    mkdirSync(outDir, { recursive: true })
    cpSync(iconSrc, resolve(outDir, 'icon.png'))
  }
  return {
    name: 'copy-app-icon',
    buildStart: copy,
    closeBundle: copy
  }
}

/** 项目根目录（依赖 process.cwd()） */
const projectRoot = resolve('.')
const sharkerUiSrc = resolve(projectRoot, 'src/sharker-core/packages/ui/src')
const sharkerCoreSrc = resolve(projectRoot, 'src/sharker-core/packages/core/src')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copyAppIconPlugin()],
    build: {
      lib: {
        entry: resolve(projectRoot, 'electron/main/index.ts')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve(projectRoot, 'electron/preload/index.ts')
      }
    }
  },
  renderer: {
    root: resolve(projectRoot, 'src'),
    resolve: {
      preserveSymlinks: true,
      dedupe: ['react', 'react-dom'],
      alias: [
        { find: 'node:crypto', replacement: resolve(projectRoot, 'src/shims/node-crypto.ts') },
        { find: 'node:util', replacement: resolve(projectRoot, 'src/shims/node-util.ts') },
        { find: '@sharker/ui/icons', replacement: resolve(sharkerUiSrc, 'icons.tsx') },
        { find: '@sharker/ui/styles.css', replacement: resolve(sharkerUiSrc, 'styles.css') },
        { find: '@sharker/ui/assistant-stream', replacement: resolve(sharkerUiSrc, 'assistant-stream.ts') },
        { find: '@sharker/ui/sharker-uri', replacement: resolve(sharkerUiSrc, 'sharker-uri.ts') },
        { find: /^@sharker\/ui$/, replacement: resolve(sharkerUiSrc, 'index.ts') },
        { find: /^@sharker\/core\/(.*)$/, replacement: `${sharkerCoreSrc}/$1` }
      ]
    },
    server: {
      fs: {
        allow: [projectRoot],
        strict: false
      }
    },
    build: {
      rollupOptions: {
        input: resolve(projectRoot, 'src/index.html')
      }
    },
    plugins: [react()]
  }
})
