@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 24 from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)
node -e "if(Number(process.versions.node.split('.')[0])!==24){console.error('This development build requires Node.js 24.');process.exit(1)}"
if errorlevel 1 (
  pause
  exit /b 1
)
echo Starting local development server. No paid service or npm install is needed.
echo Open http://127.0.0.1:8787 in your browser after the server starts.
echo Keep this window open. Press Ctrl+C to stop.
node server/main.mjs
pause
