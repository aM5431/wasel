@echo off
chcp 65001 >nul
echo ========================================
echo   📁 إعادة تسمية المجلد إلى "wasel"
echo ========================================
echo.

echo تحذير: تأكد من إغلاق:
echo  - Visual Studio Code
echo  - PowerShell
echo  - أي برامج أخرى تستخدم هذا المجلد
echo.
pause

cd ..
if exist "wasel" (
    echo ❌ المجلد "wasel" موجود بالفعل!
    pause
    exit /b 1
)

echo جاري إعادة التسمية...
ren "سسسسسسسسسس" "wasel"

if exist "wasel" (
    echo ✅ تم! المجلد الآن اسمه "wasel"
    echo.
    echo المسار الجديد:
    echo   C:\Users\amin\Desktop\wasel
) else (
    echo ❌ فشلت إعادة التسمية. تأكد من إغلاق جميع البرامج.
)

echo.
pause
