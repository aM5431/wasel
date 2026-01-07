@echo off
echo 🚀 Starting Islamic Reminders WhatsApp SaaS Platform...
echo.

REM Check if Docker is running
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker is not running. Please start Docker Desktop first.
    pause
    exit /b 1
)

echo ✅ Docker is running
echo.

REM Build and start the application
echo 🔨 Building Docker image...
docker-compose build

if %errorlevel% neq 0 (
    echo ❌ Failed to build Docker image
    pause
    exit /b 1
)

echo ✅ Docker image built successfully
echo.

echo 🚀 Starting application...
docker-compose up -d

if %errorlevel% neq 0 (
    echo ❌ Failed to start application
    pause
    exit /b 1
)

echo.
echo ✅ Application started successfully!
echo.
echo 🌐 Access your application at: http://localhost:3001
echo 📊 View logs: docker-compose logs -f
echo 🛑 Stop application: docker-compose down
echo.

REM Wait a moment for the application to start
echo ⏳ Waiting for application to start...
timeout /t 10 /nobreak >nul

REM Check if application is responding
curl -s http://localhost:3001 >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Application is responding!
    echo 🎉 Ready to use!
) else (
    echo ⚠️  Application might still be starting...
    echo 📋 Check logs with: docker-compose logs -f
)

echo.
pause