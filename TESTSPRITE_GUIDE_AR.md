# تشغيل TestSprite عندك في 60 ثانية (بدون ما تبعت الـAPI Key)

TestSprite عندك متسطّب داخل المشروع، لكن لازم “تشغيله” من جهازك لأنّه بيشتغل كـ MCP Server.

## 1) حط الـAPI Key عندك محليًا

في PowerShell:

```powershell
$env:TESTSPRITE_API_KEY="ضع_المفتاح_هنا"
```

مهم: ما تكتبش الـAPI Key داخل أي ملف في المشروع.

## 2) شغّل TestSprite Server بزر واحد

```powershell
npm run testsprite:server
```

لو اشتغل هتلاقيه بدأ MCP Server.

## 3) اربطه بالـIDE (Cursor/VSCode)

في إعدادات MCP داخل الـIDE حط:

```json
{
  "mcpServers": {
    "TestSprite": {
      "command": "npx",
      "args": ["@testsprite/testsprite-mcp@latest"],
      "env": { "TESTSPRITE_API_KEY": "ضع_المفتاح_هنا" }
    }
  }
}
```

بعدها من الشات داخل الـIDE قول:

“اختبر تبويب الأذكار والمحتوى في صفحة Islamic Reminders واطلع تقرير أخطاء”

## 4) تشغيل Generate/Rerun (اختياري)

```powershell
npm run testsprite:run
```

```powershell
npm run testsprite:rerun
```

## ملاحظات مهمة

- TestSprite محتاج API_KEY عشان ينفذ الاختبارات في السحابة ويطلع تقرير.
- لو Node عندك قديم جدًا وظهرت مشاكل، حدّث Node لنسخة أحدث.
 - لو نسيت تعمل Set للـ API_KEY، السكربت هيوقف ويقولك تعمل إيه بالظبط.
