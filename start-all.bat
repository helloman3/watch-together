@echo off
title Watch Together Launcher
echo ========================================================
echo   Starting Watch Together Server & App...
echo ========================================================

echo Freeing ports 3001 and 3000 if occupied...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001 " ^| findstr "LISTENING"') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " ^| findstr "LISTENING"') do taskkill /f /pid %%a >nul 2>&1
timeout /t 1 >nul

start "Watch Together Server" cmd /k "cd server && node server.js"
timeout /t 2 >nul
start "Watch Together Client" cmd /k "cd client && npm run dev"

echo ========================================================
echo App is launching! 
echo Local PC: http://localhost:3000
echo Phone:    Check the server terminal window for your phone IP
echo ========================================================
