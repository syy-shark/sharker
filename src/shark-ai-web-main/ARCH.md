# shark-ai-web-main — Sharker 官网

## 职责

- 对外营销站：主页讲产品，`/tutorial` 单独演示 README 本地跑起来的流程。
- 不负责桌面 Agent 本身；部署后再由你接到域名。

## 同级目录

| 目录 | 说明 |
|------|------|
| [src/](./src/ARCH.md) | 站点源码（路由、落地页组件、样式） |
| `public/` | logo、品牌图、英雄背景等静态资源 |
| `.grok/` | 生成器技能（不要当产品逻辑改） |
| `.vercel/` | 上次构建产物 |

## 同级文件

| 文件 | 说明 |
|------|------|
| `package.json` | `npm run dev` 起在 `0.0.0.0:8080` |
| `vite.config.ts` | TanStack Start + Tailwind；构建时走 Vercel / Nitro |
| `AGENTS.md` | 生成器工作区说明（预览约定） |
| `ARCH.md` | 本层架构说明 |
