# Windows 启动脚本：Vite/esbuild 无法处理含非 ASCII 字符的项目路径（如「项目」）。
# 通过 SUBST 映射到 Z: 盘符后再启动开发服务器。
$ErrorActionPreference = "Stop"
$ProjectPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Drive = "Z:"

# 若 Z: 已占用则先卸载
cmd /c "subst $Drive /d" 2>$null | Out-Null
cmd /c "subst $Drive `"$ProjectPath`"" | Out-Null

Set-Location "${Drive}\"
$env:NO_SANDBOX = "1"
Write-Host "Sharker dev: ${Drive}\  (source: $ProjectPath)" -ForegroundColor Cyan
npx electron-vite dev
