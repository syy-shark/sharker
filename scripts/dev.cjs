/**
 * 根目录开发入口：启动 Maka 桌面（src/maka-core），不挂 Sharker 壳。
 * Sharker 仍可用 `npm run dev:sharker`。
 * @see scripts/ARCH.md
 */
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const makaRoot = path.join(root, "src", "maka-core");
const makaMarker = path.join(makaRoot, "node_modules", "typescript", "bin", "tsc");

if (!fs.existsSync(path.join(makaRoot, "package.json"))) {
  console.error("[dev] missing src/maka-core; cannot start Maka");
  process.exit(1);
}

if (!fs.existsSync(makaMarker)) {
  console.log("[dev] Maka workspaces are not installed; running npm install in src/maka-core …");
  const install = spawnSync("npm", ["install"], {
    cwd: makaRoot,
    env: process.env,
    stdio: "inherit",
  });
  if (install.status !== 0) {
    process.exit(install.status ?? 1);
  }
}

console.log("[dev] starting Maka desktop");
const child = spawn("npm", ["run", "dev"], {
  cwd: makaRoot,
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
