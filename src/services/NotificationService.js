const { db } = require('../database/db');
const sessionManager = require('./baileys/SessionManager');
const messageService = require('./baileys/MessageService');

class NotificationService {

    /**
     * Find an active admin session to send notifications from
     */
    async getAdminSession() {
        try {
            // 1. Get all admin users
            const admins = await db.all('SELECT id FROM users WHERE role = "admin"');
            if (!admins || admins.length === 0) {
                console.warn('[NotificationService] No admin users found in database');
                return null;
            }
            const adminIds = admins.map(a => a.id);

            // 2. Get all active connected sessions
            const sessions = sessionManager.getAllSessions();
            if (!sessions || sessions.length === 0) {
                console.warn('[NotificationService] No active sessions available');
                return null;
            }

            console.log(`[NotificationService] Found ${sessions.length} sessions, ${adminIds.length} admins`);

            // 3. Find first session that belongs to an admin and is connected
            // Primary match: sessionId encodes user id (pattern user_{id}_...)
            for (const session of sessions) {
                if (!session.connected) continue;

                // Check if session ID follows pattern "user_{id}_{timestamp}"
                const parts = session.sessionId.split('_');
                if (parts.length >= 2 && parts[0] === 'user') {
                    const userId = parts[1];
                    if (adminIds.includes(userId)) {
                        console.log(`[NotificationService] Found admin session (by id): ${session.sessionId} (${session.phoneNumber})`);
                        return session.sessionId;
                    }
                }
            }

            // 4. Fallback: match by phone number (normalize digits)
            // Fetch admin phones and normalize
            const adminPhones = (await db.all('SELECT id, phone FROM users WHERE role = "admin"'))
                .map(a => ({ id: a.id, phone: (a.phone || '').replace(/\D/g, '') }));

            for (const session of sessions) {
                if (!session.connected) continue;
                if (!session.phoneNumber) continue;

                const sessPhone = session.phoneNumber.replace(/\D/g, '');

                for (const adm of adminPhones) {
                    if (!adm.phone) continue;
                    // Match by ending digits (handles country code differences)
                    if (sessPhone.endsWith(adm.phone) || adm.phone.endsWith(sessPhone)) {
                        console.log(`[NotificationService] Found admin session (by phone): ${session.sessionId} matched admin ${adm.id}`);
                        return session.sessionId;
                    }
                }
            }

            console.warn('[NotificationService] No connected admin session found');
            // Final fallback: return any connected session (useful for testing or single-admin setups)
            for (const session of sessions) {
                if (session.connected) {
                    console.log(`[NotificationService] Falling back to any connected session: ${session.sessionId}`);
                    return session.sessionId;
                }
            }

            return null;
        } catch (error) {
            console.error('[NotificationService] Error finding admin session:', error);
            return null;
        }
    }

    /**
     * Send trial activation message
     */
    async sendTrialActivation(user, plan, subscription) {
        try {
            console.log(`[NotificationService] Attempting to send trial activation to ${user.phone}`);

            const adminSessionId = await this.getAdminSession();

            if (!adminSessionId) {
                console.warn('[NotificationService] No active admin session found. Notification will NOT be sent.');
                console.warn('[NotificationService] Admin needs to connect WhatsApp first!');
                return false;
            }

            const message = `🎉 *مرحباً بك في منصة واصل*

أهلاً بك يا *${user.name}* 👋
تم تفعيل باقتك التجريبية بنجاح!

📋 *تفاصيل الباقة:*
🏷️ الخطة: *${plan.name}*
📅 المدة: *${plan.duration_days} يوم*
✅ الحالة: *نشطة*
🔚 تنتهي في: *${new Date(subscription.endDate).toLocaleDateString('ar-EG')}*

استمتع بتجربة كاملة لمميزات المنصة. لا تتردد في التواصل معنا إذا احتجت أي مساعدة! 🌹

_هذه رسالة تلقائية من النظام_`;

            console.log(`[NotificationService] Sending message from session: ${adminSessionId}`);
            await messageService.sendMessage(adminSessionId, user.phone, message);
            console.log(`✅ [NotificationService] Trial activation sent to ${user.phone}`);
            return true;

        } catch (error) {
            console.error('[NotificationService] Error sending trial notification:', error.message);
            console.error('[NotificationService] Stack:', error.stack);
            // Don't throw, just log
            return false;
        }
    }

    /**
     * Send a detailed onboarding / welcome message to a newly logged-in user
     */
    async sendWelcome(user) {
        try {
            console.log(`[NotificationService] Attempting to send welcome message to ${user.phone}`);
            const adminSessionId = await this.getAdminSession();

            if (!adminSessionId) {
                console.warn('[NotificationService] No active admin session found. Welcome message will NOT be sent.');
                return false;
            }

            const message = `👋 مرحباً ${user.name}!

شكراً لانضمامك إلى منصة واصل. هذه رسالة ترحيبية قصيرة تحتوي على أهم الخطوات للبدء:

1) إعداد الجلسة: اذهب إلى "جلساتي" وقم بإضافة حساب WhatsApp أو قم بمسح QR على تطبيق WhatsApp Business.
2) إضافة الأرقام: يمكنك رفع ملف CSV أو إضافة جهات الاتصال يدوياً من لوحة التحكم.
3) إعداد القوالب: إن أردت رسائل سريعة أو أزرار، اذهب إلى "قوالب الرسائل" وأنشئ ما يلزم.
4) حد الاستخدام: راجع خطة الاشتراك في لوحة "الباقات" لمعرفة حدود الإرسال وعدد الجلسات.

نصائح متقدمة:
- استخدم فترات تأخير بين الرسائل لتجنب الحظر.
- اربط webhook لاستقبال حالة الرسائل والردود تلقائياً.

لو احتجت مساعدة سريعة، رد على هذه الرسالة هنا أو تواصل مع فريق الدعم.

مرة أخرى، أهلاً بك في واصل! 🚀`;

            console.log(`[NotificationService] Sending welcome from session: ${adminSessionId}`);
            await messageService.sendMessage(adminSessionId, user.phone, message);
            console.log(`✅ [NotificationService] Welcome message sent to ${user.phone}`);
            return true;

        } catch (error) {
            console.error('[NotificationService] Error sending welcome message:', error.message);
            console.error('[NotificationService] Stack:', error.stack);
            return false;
        }
    }
    /**
     * Send payment notification to admin with receipt
     */
    async sendPaymentNotification(paymentData, receiptPath) {
        try {
            console.log(`[NotificationService] Sending payment notification for user ${paymentData.userId}`);

            const adminSessionId = await this.getAdminSession();
            if (!adminSessionId) {
                console.warn('[NotificationService] No admin session found. Cannot send payment notification.');
                return false;
            }

            // Get Admin Phone Number to send TO
            const adminUser = await db.get('SELECT phone FROM users WHERE role = "admin" LIMIT 1');
            if (!adminUser || !adminUser.phone) {
                console.warn('[NotificationService] No admin phone number found in DB.');
                return false;
            }

            const fs = require('fs');
            const path = require('path');

            // Resolve absolute path for the image
            // receiptPath comes from DB as '/uploads/payment/...'
            const absolutePath = path.join(__dirname, '../../public', receiptPath);

            if (!fs.existsSync(absolutePath)) {
                console.error(`[NotificationService] Receipt file not found at ${absolutePath}`);
                return false;
            }

            const mediaBuffer = fs.readFileSync(absolutePath);

            const caption = `💰 *طلب دفع جديد*
            
👤 *المستخدم:* ${paymentData.userName} (${paymentData.userPhone})
🏷️ *الخطة:* ${paymentData.planName}
💵 *المبلغ:* ${paymentData.amount} ج.م
🏦 *الطريقة:* ${paymentData.method}
🔢 *المرجع:* ${paymentData.transactionRef || 'لا يوجد'}

يرجى مراجعة الإيصال وتفعيل الاشتراك من لوحة التحكم.`;

            await messageService.sendMedia(
                adminSessionId,
                adminUser.phone,
                mediaBuffer,
                caption,
                'image'
            );

            console.log(`✅ [NotificationService] Payment notification sent to admin (${adminUser.phone})`);
            return true;

        } catch (error) {
            console.error('[NotificationService] Error sending payment notification:', error);
            return false;
        }
    }
    /**
     * Send subscription activation message to user
     */
    async sendSubscriptionActivated(user, planName, endDate) {
        try {
            console.log(`[NotificationService] Sending activation notice to ${user.phone}`);

            const adminSessionId = await this.getAdminSession();
            if (!adminSessionId) return false;

            const message = `🎉 *تم تفعيل اشتراكك بنجاح!*
            
أهلاً بك يا *${user.name}* 👋
تم استلام دفعتك وتفعيل الباقة بنجاح.

📋 *تفاصيل الاشتراك:*
🏷️ الباقة: *${planName}*
✅ الحالة: *نشطة*
🔚 تنتهي في: *${new Date(endDate).toLocaleDateString('ar-EG')}*

شكراً لثقتك بنا! 🌹`;

            await messageService.sendMessage(adminSessionId, user.phone, message);
            return true;
        } catch (error) {
            console.error('[NotificationService] Error sending activation:', error);
            return false;
        }
    }
    /**
     * Send payment rejection message to user
     */
    async sendPaymentRejected(user, reason) {
        try {
            console.log(`[NotificationService] Sending rejection notice to ${user.phone}`);

            const adminSessionId = await this.getAdminSession();
            if (!adminSessionId) return false;

            let reasonText = reason || 'بيانات الدفع غير واضحة أو غير مطابقة.';

            const message = `❌ *عذراً، تم رفض طلب الدفع*

أهلاً بك يا *${user.name}*
نأسف لإبلاغك بأنه لم يتم قبول طلب الدفع الأخير.

📝 *السبب:*
${reasonText}

يرجى التأكد من البيانات وإعادة المحاولة، أو التواصل مع الدعم الفني.`;

            await messageService.sendMessage(adminSessionId, user.phone, message);
            return true;
        } catch (error) {
            console.error('[NotificationService] Error sending rejection:', error);
            return false;
        }
    }

    /**
     * Create a notification in the database for all admin users
     */
    async createAdminNotification(title, message, type = 'info') {
        try {
            const admins = await db.all('SELECT id FROM users WHERE role = "admin"');
            for (const admin of admins) {
                await db.run(
                    'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
                    [admin.id, title, message, type]
                );
            }
            return true;
        } catch (error) {
            console.error('[NotificationService] Error creating admin notification:', error);
            return false;
        }
    }
}

module.exports = new NotificationService();
