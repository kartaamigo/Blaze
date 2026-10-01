@echo off
if not exist "%~dp0node_modules\electron\dist\electron.exe" (
  echo Electron is not installed. See README.md.
  pause
  exit /b 1
)
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
