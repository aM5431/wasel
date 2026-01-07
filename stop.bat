@echo off
chcp 65001 >nul
title Islamic Reminders - Stopping Server

echo.
echo ========================================
echo   Islamic Reminders WhatsApp Platform
echo ========================================
echo.
echo Stopping all Node.js processes...
echo.

taskkill /F /IM node.exe >nul 2>&1

if %errorlevel% equ 0 (
    echo ✅ Server stopped successfully!
) else (
    echo ℹ️  No running server found.
)

echo.
pause
