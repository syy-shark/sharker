/**
 * 根目录开发入口：启动 Sharker 桌面（src/sharker-core），不挂 Sharker 壳。
 * Sharker 仍可用 `npm run dev:sharker`。
 * @see scripts/ARCH.md
 */
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sharkerRoot = path.join(root, "src", "sharker-core");
const sharkerMarker = path.join(sharkerRoot, "node_modules", "typescript", "bin", "tsc");

if (!fs.existsSync(path.join(sharkerRoot, "package.json"))) {
  console.error("[dev] missing src/sharker-core; cannot start Sharker");
  process.exit(1);
}

if (!fs.existsSync(sharkerMarker)) {
  console.log("[dev] Sharker workspaces are not installed; running npm install in src/sharker-core …");
  const install = spawnSync("npm", ["install"], {
    cwd: sharkerRoot,
    env: process.env,
    stdio: "inherit",
  });
  if (install.status !== 0) {
    process.exit(install.status ?? 1);
  }
}

console.log("[dev] starting Sharker desktop");
const child = spawn("npm", ["run", "dev"], {
  cwd: sharkerRoot,
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
