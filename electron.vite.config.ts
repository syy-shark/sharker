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
const makaUiSrc = resolve(projectRoot, 'src/maka-core/packages/ui/src')
const makaCoreSrc = resolve(projectRoot, 'src/maka-core/packages/core/src')

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
        { find: '@maka/ui/icons', replacement: resolve(makaUiSrc, 'icons.tsx') },
        { find: '@maka/ui/styles.css', replacement: resolve(makaUiSrc, 'styles.css') },
        { find: '@maka/ui/assistant-stream', replacement: resolve(makaUiSrc, 'assistant-stream.ts') },
        { find: '@maka/ui/maka-uri', replacement: resolve(makaUiSrc, 'maka-uri.ts') },
        { find: /^@maka\/ui$/, replacement: resolve(makaUiSrc, 'index.ts') },
        { find: /^@maka\/core\/(.*)$/, replacement: `${makaCoreSrc}/$1` }
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
