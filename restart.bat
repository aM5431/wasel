@echo off
chcp 65001 >nul
title Islamic Reminders - Restart Server

echo.
echo ========================================
echo   Islamic Reminders WhatsApp Platform
echo ========================================
echo.
echo Restarting server...
echo.

echo Stopping current server...
taskkill /F /IM node.exe >nul 2>&1

echo Waiting 3 seconds...
timeout /t 3 /nobreak >nul

echo Starting server...
echo.
npm start

pause
