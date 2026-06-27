/**
 * Electron-Vite 构建配置：主进程、preload、React 渲染进程三端打包。
 * @see docs/ARCHITECTURE.md
 */
import { cpSync, existsSync, mkdirSync } from 'fs'
import { dirname, resolve } from 'path'
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

/** 复制 bundled skills 到主进程输出目录 */
function copyBundledSkillsPlugin(): Plugin {
  const skillsSrc = resolve('skills/bundled')
  const copy = () => {
    if (!existsSync(skillsSrc)) return
    const outDir = resolve('out/main/skills/bundled')
    mkdirSync(dirname(outDir), { recursive: true })
    cpSync(skillsSrc, outDir, { recursive: true })
  }
  return {
    name: 'copy-bundled-skills',
    buildStart: copy,
    closeBundle: copy
  }
}

/** 项目根目录（依赖 process.cwd()，Windows 开发请从 ASCII 盘符路径启动，见 scripts/launch-sharker.ps1） */
const projectRoot = resolve('.')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copyAppIconPlugin(), copyBundledSkillsPlugin()],
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
      preserveSymlinks: true
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
