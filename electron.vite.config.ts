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

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copyAppIconPlugin()],
    build: {
      lib: {
        entry: resolve('electron/main/index.ts')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve('electron/preload/index.ts')
      }
    }
  },
  renderer: {
    root: resolve('src'),
    build: {
      rollupOptions: {
        input: resolve('src/index.html')
      }
    },
    plugins: [react()]
  }
})
