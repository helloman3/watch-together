@echo off
title Build Watch Together Windows EXE
echo ========================================================
echo   Building Watch Together Windows Executable (.exe)...
echo ========================================================

echo [1/2] Building optimized web client assets...
cd client
call npm run build
cd ..

echo [2/2] Compiling native WatchTogether.exe launcher...
"C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /target:winexe /out:"WatchTogether.exe" "scripts\Launcher.cs"

echo.
echo ========================================================
echo   BUILD SUCCESSFUL!
echo.
echo   Your standalone Windows executable is ready:
echo   --^> WatchTogether.exe (in this root directory)
echo.
echo   You can double-click WatchTogether.exe directly!
echo ========================================================
pause
