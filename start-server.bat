@echo off
title Watch Together Server
echo ========================================================
echo   Watch Together Sync Server
echo ========================================================
echo Checking and freeing port 3001...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001 " ^| findstr "LISTENING"') do taskkill /f /pid %%a >nul 2>&1
timeout /t 1 >nul
cd server
echo Starting Server...
node server.js
pause
