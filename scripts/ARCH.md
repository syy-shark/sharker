# scripts — 开发与环境脚本

## 职责

- 本地开发启动封装
- Computer / Browser / Voice 相关运行时安装与诊断
- 资源处理辅助脚本

## 同级目录

（无子目录）

## 同级文件

| 文件 | 说明 |
|------|------|
| `dev.cjs` | 根目录 `npm run dev`：在 `src/sharker-core` 装好依赖后启动 Sharker 桌面，不挂 Sharker 壳 |
| `dev-sharker.cjs` | `npm run dev:sharker`：原来的 `electron-vite dev` Sharker 壳 |
| `launch-sharker.sh` | 进入仓库根并 `npm run dev:sharker` |
| `setup-browser-use.sh` | 安装 Chrome native messaging manifest（Browser Use） |
| `setup-cua-driver.sh` | cua-driver 检测与 doctor（可选桌面自动化后端） |
| `install-kokoro-runtime.sh` | 安装 Kokoro TTS 运行时（Python venv + 模型） |
| `extract-shark-logo.py` | 从原图裁切鲨鱼 logo（资源维护） |
| `fix-node-pty.sh` | 给 node-pty `spawn-helper` 加 +x（修 posix_spawnp failed） |
| `ARCH.md` | 本层架构说明 |

## 相关文档

- [docs/computer-use-setup.md](../docs/computer-use-setup.md)
