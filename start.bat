@echo off
chcp 65001 >nul
title Islamic Reminders - Starting Server

echo.
echo ========================================
echo   Islamic Reminders WhatsApp Platform
echo ========================================
echo.
echo Starting server on http://localhost:3001
echo Press Ctrl+C to stop the server
echo.


:: Open browser after 5 seconds
start /b cmd /c "timeout /t 5 >nul && start http://localhost:3001"

npm start

pause