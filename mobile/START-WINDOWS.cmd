@echo off
setlocal
cd /d "%~dp0"
set "ACA_NODE=node"
if exist ".runtime\node-path.txt" (
  set /p "ACA_NODE_REL=" < ".runtime\node-path.txt"
)
if defined ACA_NODE_REL set "ACA_NODE=%~dp0.runtime\%ACA_NODE_REL%"
"%ACA_NODE%" -e "if(Number(process.versions.node.split('.')[0])!==24){console.error('This development build requires Node.js 24.');process.exit(1)}" >nul 2>nul
if errorlevel 1 (
  echo Please run INSTALL-AND-TEST-WINDOWS.cmd first, or install Node.js 24 from https://nodejs.org/.
  if not defined ACA_NONINTERACTIVE pause
  exit /b 1
)
if not defined ACA_DEV_PORT set "ACA_DEV_PORT=8787"
echo Starting local development server. No paid service is needed.
echo Open http://127.0.0.1:%ACA_DEV_PORT% in your browser after the server starts.
echo Keep this window open. Press Ctrl+C to stop.
"%ACA_NODE%" server/main.mjs
set "ACA_RESULT=%ERRORLEVEL%"
if not defined ACA_NONINTERACTIVE pause
exit /b %ACA_RESULT%
