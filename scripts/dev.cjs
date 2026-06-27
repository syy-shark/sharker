const { spawn } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function run(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...options.env },
    stdio: "inherit",
    shell: options.shell ?? false,
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

if (process.platform === "win32") {
  run("cmd.exe", ["/d", "/s", "/c", path.join(root, "scripts", "launch-sharker.cmd")]);
} else {
  const bin = path.join(root, "node_modules", ".bin", "electron-vite");
  run(bin, ["dev"], { env: { NO_SANDBOX: "1" } });
}
