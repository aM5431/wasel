@echo off
echo 🛑 Stopping Islamic Reminders WhatsApp SaaS Platform...
echo.

docker-compose down

if %errorlevel% equ 0 (
    echo ✅ Application stopped successfully!
) else (
    echo ❌ Failed to stop application
)

echo.
pause