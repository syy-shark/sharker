@echo off
REM Windows 启动：SUBST 映射到 Z:（规避中文路径）+ 不依赖 PowerShell 执行策略
setlocal
set "SCRIPT_DIR=%~dp0"
set "ROOT=%SCRIPT_DIR%.."
for %%I in ("%ROOT%") do set "ROOT=%%~fI"

subst Z: /d >nul 2>&1
subst Z: "%ROOT%"
if errorlevel 1 (
  echo [sharker] SUBST failed for: %ROOT%
  exit /b 1
)

echo [sharker] dev on Z:\  ^(source: %ROOT%^)
Z:
cd \
set NO_SANDBOX=1

if exist "%ROOT%\node_modules\.bin\electron-vite.cmd" (
  call "%ROOT%\node_modules\.bin\electron-vite.cmd" dev
) else (
  call npx.cmd electron-vite dev
)
endlocal
