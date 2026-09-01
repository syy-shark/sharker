# src/shims — 渲染进程 Node 内置替身

## 职责

- 给抄来的 Maka `@maka/core` 在浏览器里提供 `node:crypto` / `node:util`
- **不**当密码学或 Node 完整实现用

## 同级目录

（无子目录）

## 同级文件

| 文件 | 说明 |
|------|------|
| `node-crypto.ts` | `createHash` 同步 digest，给消息 content digest |
| `node-util.ts` | `inspect` / `formatWithOptions` |
| `ARCH.md` | 本层架构说明 |
