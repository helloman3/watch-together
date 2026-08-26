@echo off
title Build Watch Together Android APK
echo ========================================================
echo   Building Watch Together Android Project (Capacitor)...
echo ========================================================

REM Find JAVA_HOME if not set
if "%JAVA_HOME%"=="" (
    if exist "C:\Program Files\Android\Android Studio1\jbr" (
        set "JAVA_HOME=C:\Program Files\Android\Android Studio1\jbr"
    ) else if exist "C:\Program Files\Android\Android Studio\jbr" (
        set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
    )
)

echo [1/3] Building web client assets...
cd client
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Vite web build failed.
    pause
    exit /b %errorlevel%
)

echo.
echo [2/3] Syncing assets with native Android project...
call npx cap sync android
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Capacitor sync failed.
    pause
    exit /b %errorlevel%
)

echo.
echo [3/3] Compiling native Android APK via Gradle...
cd android
call gradlew.bat assembleDebug
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Gradle APK compilation failed.
    pause
    exit /b %errorlevel%
)

cd ..\..
copy /Y "client\android\app\build\outputs\apk\debug\app-debug.apk" "WatchTogether.apk" >nul

echo.
echo ========================================================
echo   SUCCESS: Android APK built successfully!
echo   Location: WatchTogether.apk
echo ========================================================
echo.
pause
