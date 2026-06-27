@echo off
REM Cua Driver setup for Windows (Sharker)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-cua-driver.ps1" %*
exit /b %ERRORLEVEL%
