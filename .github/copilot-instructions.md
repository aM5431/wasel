# تعليمات Copilot لمنصة WhatsApp SaaS

## 📋 نظرة عامة على المشروع

منصة SaaS متكاملة لإدارة جلسات WhatsApp متعددة مع نظام اشتراكات وسياسات دفع. يعتمد المشروع على **Express.js** و **Baileys** (مكتبة WhatsApp غير رسمية) و **SQLite**.

---

## 🏗️ المعمارية الأساسية

### مستويات التطبيق:

```
┌─────────────────────────────────────────┐
│      واجهة المستخدم (EJS + CSS)       │
├─────────────────────────────────────────┤
│   Express Routes (auth, whatsapp, payment, admin)
├─────────────────────────────────────────┤
│   Business Logic Services (Baileys, Auth, Payment)
├─────────────────────────────────────────┤
│   Middleware (Auth, Connection Stability)
├─────────────────────────────────────────┤
│   SQLite Database (users, sessions, subscriptions)
└─────────────────────────────────────────┘
```

### الملفات الأساسية:

- **[server.js](server.js)** - نقطة البداية الرئيسية، تهيئة التطبيق واستعادة الجلسات
- **[src/database/db.js](src/database/db.js)** - wrapper متزامن لـ SQLite مع schema الجداول
- **[src/services/baileys/SessionManager.js](src/services/baileys/SessionManager.js)** - إنشاء وإدارة جلسات WhatsApp
- **[src/services/baileys/MessageService.js](src/services/baileys/MessageService.js)** - إرسال الرسائل والأزرار
- **[src/middleware/auth.js](src/middleware/auth.js)** - JWT authentication وفحص الأدوار

---

## 🔑 أنماط وقواعد المشروع

### 1. **معالجة قاعدة البيانات**

```javascript
// ✅ الطريقة الصحيحة - استخدم الـ wrapper المتزامن
const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
const users = await db.all('SELECT * FROM users');
await db.run('INSERT INTO users (id, name) VALUES (?, ?)', [id, name]);

// ❌ تجنب - لا تستخدم callback style
db.get('SELECT...', callback)
```

- استخدم **db.get()** للحصول على صف واحد (يرجع null إذا لم يوجد)
- استخدم **db.all()** للحصول على صفوف متعددة (يرجع array فارغ إذا لم يوجد)
- استخدم **db.run()** للـ INSERT/UPDATE/DELETE (يرجع {id, changes})
- **لا توجد transactions** - تجنب العمليات الحرجة المتعددة

### 2. **إدارة الجلسات**

```javascript
// ✅ إنشاء/استعادة جلسة
await sessionManager.createSession(sessionId, {
    onQR: (qrCode) => { /* QR code received */ },
    onConnected: async (info) => { /* Mark as connected in DB */ },
    onDisconnected: async (reason) => { /* Mark as disconnected */ },
    isNew: true // Set true فقط عند إنشاء جديدة
});

// ✅ الحصول على جلسة نشطة
const session = sessionManager.getSession(sessionId);
if (!session?.user) throw new Error('Not connected');

// ✅ إزالة جلسة
await sessionManager.removeSession(sessionId);
```

**النقاط المهمة:**
- الجلسات تُخزن في `src/auth_sessions/{sessionId}/` (لا تحذفها يدويًا)
- كل جلسة لها معرّف خاص: `user_{userId}_{timestamp}`
- الجلسات المتصلة تُحفظ في DB مع `connected = 1`
- عند إعادة تشغيل الخادم، يستعيد الجلسات المتصلة سابقًا تلقائيًا

### 3. **الفحوصات الأمنية والملكية**

```javascript
// ✅ فحص ملكية الجلسة (من whatsapp.js)
const checkSessionOwner = async (req, sessionId) => {
    if (req.user.role === 'admin') return true; // Admin يملك الكل
    
    const session = await db.get(
        'SELECT user_id FROM whatsapp_sessions WHERE session_id = ?',
        [sessionId]
    );
    return session?.user_id == req.user.id; // Check ownership
};

// ❌ لا تثق بـ sessionId من الـ client بدون التحقق من الملكية
```

- **Admin** يمكنه الوصول لجميع الجلسات
- **المستخدم العادي** يمكنه الوصول فقط لجلساته الخاصة
- كل endpoint في `/api/whatsapp/*` يجب أن يتحقق من الملكية

### 4. **معالجة الأخطاء والرسائل الاستثنائية**

```javascript
// ✅ استخدم محاولة-التقط مع logs واضحة
try {
    const result = await messageService.sendMessage(sessionId, phone, msg);
    console.log(`✅ Message sent to ${phone}`);
    res.json({ success: true, result });
} catch (error) {
    console.error('Error sending message:', error.message);
    res.status(400).json({ error: error.message });
}

// ✅ اترك error stack traces في الـ console (مفيد للـ debugging)
// ❌ لا تكشفها للـ client (يمكن أن تسرب معلومات حساسة)
```

---

## 🔄 سير عمل الاشتراكات والدفع

```javascript
// 1. التسجيل → إنشاء مستخدم + اشتراك
await AuthService.register({ name, phone, email, password, planId });
// إذا كانت الخطة trial → subscription.status = 'active'
// إذا لم تكن → subscription.status = 'pending' + توجيه للدفع

// 2. الدفع
await PaymentService.verifyPayment(userId, planId);
// تحديث subscription.status = 'active' + حساب تواريخ الصلاحية

// 3. جدولة التحقق من انتهاء الاشتراكات
// استخدم node-cron (موجود في package.json)
```

**الجداول ذات الصلة:**
- `users` - بيانات المستخدم + password_hash
- `subscriptions` - status (active/pending/expired) + تواريخ البدء والانتهاء
- `plans` - الخطط المتاحة (trial/paid) + المميزات

---

## 📱 آلية إرسال الرسائل

```javascript
// ✅ إرسال رسالة نصية
await messageService.sendMessage(sessionId, '+201234567890', 'مرحبا');

// ✅ إرسال رسالة بأزرار
await messageService.sendButtonMessage(
    sessionId,
    '+201234567890',
    'اختر:',
    [
        { id: 'btn1', text: 'نعم' },
        { id: 'btn2', text: 'لا' }
    ]
);

// ✅ صيغة الـ JID (Jabber ID) - تحويل رقم الهاتف
const jid = phoneNumber.replace(/\D/g, '') + '@s.whatsapp.net';
```

**النقاط المهمة:**
- أرقام الهاتف يجب أن تشمل رمز الدولة (+20 لمصر مثلاً)
- الجلسة يجب أن تكون متصلة (session.user موجود)
- سرعة الإرسال محدودة (WhatsApp throttling) - أضف delays بين الرسائل

---

## 🔐 نظام المصادقة

```javascript
// ✅ Token generation و verification
const token = generateToken(user); // يرجع JWT مع {id, name, role}
res.cookie('token', token, { httpOnly: true }); // 24 ساعة انتهاء

// ✅ في الـ routes
router.get('/path', authenticateToken, (req, res) => {
    // req.user الآن متوفر = {id, name, role}
});

// ✅ فحص الـ admin
router.get('/admin-only', authenticateToken, isAdmin, (req, res) => {
    // فقط admins
});
```

**السر (SECRET):** `'super_secret_key_123'` في [src/middleware/auth.js](src/middleware/auth.js#L2)
⚠️ **في الإنتاج:** انقله إلى `.env` وآمّن Cookies

---

## ⚙️ تحسينات الأداء

### [ServerOptimizer.js](src/services/ServerOptimizer.js)
- **Compression**: ضغط الاستجابات (gzip)
- **Cache Headers**: منع الـ caching للـ dynamic content
- **Security Headers**: X-Frame-Options, X-XSS-Protection
- **Trust Proxy**: لـ reverse proxy setups

### [NetworkOptimizer.js](src/services/baileys/NetworkOptimizer.js)
- **Adaptive Timeouts**: تعديل الـ timeouts حسب الأداء
- **Connection Monitoring**: مراقبة حالة الاتصال
- **Rate Limiting**: تقسيم الرسائل لتجنب throttling

---

## 🛠️ أوامر التطوير والتشغيل

```bash
# التشغيل الأساسي
npm start          # أو node server.js

# أو استخدم الـ batch files (Windows)
.\start.bat        # تشغيل سريع
.\launch.bat       # تشغيل متقدم
```

**البيئة:**
- PORT: 3001 (افتراضي)
- DB: SQLite في `src/database/app.db`
- Auth Sessions: في `src/auth_sessions/`

---

## 📁 هيكل المجلدات

```
src/
├── database/          # SQLite + schema
├── middleware/        # Auth, Connection Stability
├── routes/           # Express routes (auth, whatsapp, payment, admin)
├── services/
│   ├── baileys/      # SessionManager, MessageService, NetworkOptimizer
│   ├── auth.js       # تسجيل، دخول
│   ├── PaymentService.js
│   ├── NotificationService.js
│   └── ServerOptimizer.js
├── views/            # EJS templates (landing, dashboard, payment)
└── auth_sessions/    # Baileys credentials (do not edit manually)

public/
├── css/
├── js/
└── uploads/payments/ # Payment proofs

.github/
└── copilot-instructions.md (هذا الملف)
```

---

## 🚨 نقاط شائعة الأخطاء

| الخطأ | السبب | الحل |
|------|------|------|
| "Session not found" | الجلسة لم تُنشأ أو انقطعت | تحقق من `sessionManager.isConnected()` |
| "Not authenticated" | Token missing أو expired | عد تحميل الصفحة بـ fresh token |
| "User not connected" | session.user = undefined | انتظر QR scan أو أعد الاتصال |
| DB locked | عمليات متزامنة على SQLite | استخدم async/await وتجنب race conditions |
| Phone number invalid | صيغة خاطئة | استخدم `jid = phone.replace(/\D/g, '') + '@s.whatsapp.net'` |

---

## ✅ Checklist عند إضافة ميزة جديدة

- [ ] أضف schema جديد في `db.js` إذا لزم
- [ ] تحقق من الملكية (user vs admin) في الـ routes
- [ ] استخدم try-catch مع logs في console.log/error
- [ ] استخدم async/await (بدون callbacks)
- [ ] اختبر مع مستخدم عادي و admin
- [ ] تأكد أن الجلسات المتصلة تُحفظ في DB

---

## 📞 التعليقات والملاحظات

- الكود يحتوي على تعليقات عربية في عدة أماكن - احافظ على هذا الأسلوب
- Socket.io موجود في package.json لكن قد لا يُستخدم بعد - مفيد للـ real-time notifications
- Redis غير موجود - إذا أضفت caching، استخدم memory cache مؤقتًا
