# tools/shared — 跨工具复用

## 职责

- 多个 builtin 共用的 FS/git/shell/卸载辅助，避免重复实现
- 不注册为独立 Tool

## 同级目录

（无子目录）

## 同级文件

| 文件 | 说明 |
|------|------|
| `fs-text.ts` | 文本文件读辅助（不存在返回 null） |
| `git-runner.ts` | `git` 子进程封装 |
| `glob.ts` | 简易 glob 匹配与遍历 |
| `grep.ts` | 目录内正则文本搜索 |
| `list-dir.ts` | 递归列目录 |
| `ignore-dirs.ts` | 遍历时跳过的目录集合 |
| `shell-spawn.ts` | macOS shell 包装 argv；交互默认 shell |
| `uninstall.ts` | 应用卸载检测、用户数据路径、残留验证 |
| `ARCH.md` | 本层架构说明 |
