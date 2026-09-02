/**
 * 启动 Sharker 自己的 electron-vite 壳（默认 `npm run dev` 已改走 Sharker）。
 * @see scripts/ARCH.md
 */
const { spawn } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const bin = path.join(root, "node_modules", ".bin", "electron-vite");
const child = spawn(bin, ["dev"], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
