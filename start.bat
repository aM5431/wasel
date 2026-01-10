@echo off
chcp 65001 >nul
title Islamic Reminders - Starting Server

echo.
echo ========================================
echo   Islamic Reminders WhatsApp Platform
echo ========================================
echo.
set "APP_PORT=%PORT%"
if "%APP_PORT%"=="" set "APP_PORT=5000"
echo Starting server on http://localhost:%APP_PORT%
echo Press Ctrl+C to stop the server
echo.


:: Open browser after 5 seconds
start /b cmd /c "timeout /t 5 >nul && start http://localhost:%APP_PORT%"

npm start

pause
