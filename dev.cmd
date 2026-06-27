@echo off
REM 双击或在 cmd 中运行；绕过 PowerShell 对 npm.ps1 的执行策略限制
cd /d "%~dp0"
call scripts\launch-sharker.cmd
