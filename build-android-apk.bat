@echo off
title Build Watch Together Android APK
echo ========================================================
echo   Building Watch Together Android Project (Capacitor)...
echo ========================================================

echo [1/2] Building web client assets...
cd client
call npm run build

echo.
echo [2/2] Syncing assets with native Android project...
call npx cap sync android

echo.
echo ========================================================
echo   ANDROID PROJECT SYNCED SUCCESSFULLY!
echo ========================================================
echo.
echo To generate your .apk file:
echo.
echo OPTION A (Recommended - Android Studio):
echo   Run 'npx cap open android' or open the folder:
echo   --^> 'client\android' in Android Studio
echo   Then click: Build --^> Build Bundle(s) / APK(s) --^> Build APK(s)
echo.
echo OPTION B (Command Line with JDK):
echo   cd client\android ^&^& gradlew.bat assembleDebug
echo   The APK will be generated in:
echo   --^> client\android\app\build\outputs\apk\debug\app-debug.apk
echo.
echo ========================================================
pause
