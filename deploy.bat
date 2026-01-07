@echo off
chcp 65001 >nul
echo ========================================
echo   🐳 WhatsApp SaaS - Docker Deployment
echo ========================================
echo.

echo [1/4] إيقاف Container القديم...
docker-compose down

echo.
echo [2/4] بناء صورة Docker جديدة...
docker-compose build --no-cache

echo.
echo [3/4] تشغيل التطبيق...
docker-compose up -d

echo.
echo [4/4] التحقق من الحالة...
timeout /t 5 /nobreak >nul
docker-compose ps

echo.
echo ========================================
echo  ✅ تم! يمكنك الآن فتح المتصفح:
echo  👉 http://localhost:3001
echo ========================================
echo.
echo للتحقق من السجلات:
echo   docker-compose logs -f
echo.
pause
