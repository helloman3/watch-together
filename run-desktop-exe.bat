@echo off
title Watch Together Desktop Cinema
echo ========================================================
echo   Launching Watch Together Desktop App...
echo ========================================================

:: Check if server is already running on port 3001
netstat -ano | findstr ":3001" | findstr "LISTENING" >nul
if %errorlevel% neq 0 (
    echo Starting Watch Together backend sync server...
    start /b "" node server/server.js
    timeout /t 2 >nul
) else (
    echo Backend sync server is already online on port 3001.
)

:: Launch in Standalone Desktop App Window (Borderless, no URL bar, 1280x800)
echo Opening Desktop App Window...

if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app="http://localhost:3001" --window-size=1280,800
    goto :done
)

if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --app="http://localhost:3001" --window-size=1280,800
    goto :done
)

if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app="http://localhost:3001" --window-size=1280,800
    goto :done
)

if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --app="http://localhost:3001" --window-size=1280,800
    goto :done
)

:: Fallback: Default Browser
start "" "http://localhost:3001"

:done
echo.
echo ========================================================
echo   Watch Together Desktop is running!
echo   Window is open at http://localhost:3001
echo ========================================================
timeout /t 3 >nul
exit
