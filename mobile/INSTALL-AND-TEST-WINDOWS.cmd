@echo off
setlocal
cd /d "%~dp0"
echo Installing a private Node.js 24 runtime from nodejs.org and running tests.
echo No administrator rights, system PATH changes, or paid services are required.
powershell.exe -NoLogo -NoProfile -Command "$ErrorActionPreference='Stop'; try { $m=Get-Content -LiteralPath 'scripts/node-windows.json' -Raw | ConvertFrom-Json; $a=$env:PROCESSOR_ARCHITEW6432; if (!$a) { $a=$env:PROCESSOR_ARCHITECTURE }; switch ($a.ToUpperInvariant()) { 'AMD64' {$a='x64'} 'ARM64' {$a='arm64'} default {throw '64-bit Windows is required.'} }; $spec=$m.platforms.$a; $name='node-v'+$m.version+'-win-'+$a; $dir=Join-Path '.runtime' $name; $exe=Join-Path $dir 'node.exe'; if (!(Test-Path -LiteralPath $exe)) { New-Item -ItemType Directory -Force -Path '.runtime' | Out-Null; $zip=Join-Path '.runtime' ($name+'.zip'); [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -TimeoutSec 180 -Uri ('https://nodejs.org/dist/v'+$m.version+'/'+$name+'.zip') -OutFile $zip; if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash -ne $spec.archiveSha256) { Remove-Item -LiteralPath $zip; throw 'Download checksum mismatch. Installation stopped.' }; Expand-Archive -LiteralPath $zip -DestinationPath '.runtime' -Force; Remove-Item -LiteralPath $zip }; if ((Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash -ne $spec.nodeSha256) {throw 'Runtime checksum mismatch. Installation stopped.'}; Set-Content -LiteralPath '.runtime/node-path.txt' -Value ($name+'/node.exe') -Encoding Ascii; Write-Host ('Runtime ready: '+$exe) } catch { Write-Error $_; exit 1 }"
if errorlevel 1 goto failed
set /p "ACA_NODE_REL=" < ".runtime\node-path.txt"
".runtime\%ACA_NODE_REL%" scripts/verify.mjs
if errorlevel 1 goto failed
echo.
echo Installation and automated checks passed. See test-results\latest.txt.
echo Double-click START-WINDOWS.cmd to open the app.
if not defined ACA_NONINTERACTIVE pause
exit /b 0
:failed
echo.
echo Setup or testing failed. Read the error above. Do not disable Windows security settings.
echo If the download failed, check access to https://nodejs.org/ and try again.
if not defined ACA_NONINTERACTIVE pause
exit /b 1
