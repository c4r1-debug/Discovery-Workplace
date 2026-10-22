@echo off
cd /d "%~dp0"
set "DISCOVERY_NODE=node"
if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "DISCOVERY_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
"%DISCOVERY_NODE%" "%~dp0scripts\start-discovery.mjs" %*
if errorlevel 1 pause
