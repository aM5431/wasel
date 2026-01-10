const express = require('express');
const router = express.Router();
const IslamicRemindersService = require('../services/IslamicRemindersService');
const PrayerTimesService = require('../services/PrayerTimesService');
const { db } = require('../database/db');
const messageService = require('../services/baileys/MessageService');
const sessionManager = require('../services/baileys/SessionManager');
const RemoteMediaService = require('../services/RemoteMediaService');
const SchedulerService = require('../services/SchedulerService');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const FastingService = require('../services/FastingService');

/**
 * Helper to get user features based on subscription
 */
async function getUserFeatures(user) {
    // Admins have all features
    if (user.role === 'admin') {
        return {
            prayer_times: true,
            adhkar: true,
            morning_evening: true,
            before_after_prayer: true,
            quran: true,
            hadith: true,
            fasting: true,
            rosary: true,
            support: true
        };
    }

    // Default features (all disabled)
    const defaultFeatures = {
        prayer_times: false,
        adhkar: false,
        morning_evening: false,
        before_after_prayer: false,
        quran: false,
        hadith: false,
        fasting: false,
        rosary: false,
        support: false
    };

    try {
        const sub = await db.get(`
            SELECT p.features 
            FROM subscriptions s
            JOIN plans p ON s.plan_id = p.id
            WHERE s.user_id = ? AND s.status = 'active'
            ORDER BY s.created_at DESC LIMIT 1
        `, [user.id]);

        if (sub && sub.features) {
            const features = JSON.parse(sub.features);
            return {
                prayer_times: !!features.prayer_times,
                adhkar: !!features.adhkar,
                morning_evening: !!(features.morning_evening || features.adhkar),
                before_after_prayer: !!(features.before_after_prayer || features.adhkar),
                quran: !!(features.quran || features.adhkar),
                hadith: !!(features.hadith || features.adhkar),
                fasting: !!features.fasting,
                rosary: !!features.rosary,
                support: !!features.support
            };
        }
    } catch (e) {
        console.error('Error fetching user features:', e);
    }

    return defaultFeatures;
}

/**
 * Middleware to check if session is linked and connected
 */
const validateSessionConnected = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const config = await IslamicRemindersService.getOrCreateConfig(userId);
        
        if (!config.session_id) {
            return res.status(200).json({ 
                success: false, 
                error: 'SESSION_NOT_LINKED',
                message: 'يجب ربط جلسة واتساب أولاً قبل القيام بهذا الإجراء.' 
            });
        }

        if (!sessionManager.isConnected(config.session_id)) {
            return res.status(200).json({ 
                success: false, 
                error: 'SESSION_NOT_CONNECTED',
                message: 'جلسة الواتساب غير متصلة حالياً. يرجى التأكد من اتصال الجلسة من صفحة الربط.' 
            });
        }

        req.islamicConfig = config;
        next();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * GET /dashboard/islamic-reminders
 * Main Islamic Reminders page (accessible to all authenticated users)
 */
router.get('/islamic-reminders', async (req, res) => {
    try {
        const userId = req.user.id;
        const userFeatures = await getUserFeatures(req.user);

        // Get or create config
        const config = await IslamicRemindersService.getOrCreateConfig(userId);

        // Get user's WhatsApp sessions
        let sessionsQuery = 'SELECT * FROM whatsapp_sessions WHERE user_id = ?';
        let sessionsParams = [userId];

        const sessions = await db.all(sessionsQuery, sessionsParams);

        // Get prayer settings
        const prayerSettings = await IslamicRemindersService.getPrayerSettings(config.id);

        // Get fasting settings
        const fastingSettings = await IslamicRemindersService.getFastingSettings(config.id);

        // Get adhkar settings
        const adhkarSettings = await IslamicRemindersService.getAdhkarSettings(config.id);

        // Get recipients
        const recipients = await IslamicRemindersService.getRecipients(config.id);

        // Calculate Prayer Times using PrayerTimesService
        const prayerTimes = await PrayerTimesService.getPrayerTimes(config);

        // Calculate Next Prayer
        const nextPrayer = await PrayerTimesService.getNextPrayer(config);

        res.render('dashboard/islamic-reminders', {
            user: req.user,
            userFeatures,
            config,
            sessions,
            prayerSettings,
            fastingSettings,
            adhkarSettings,
            recipients,
            prayerTimes,
            nextPrayer
        });
    } catch (error) {
        console.error('Islamic Reminders Page Error:', error);
        res.status(500).send('Error loading page: ' + error.message);
    }
});



/**
 * POST /api/islamic-reminders/test-notification
 * Send a test notification
 */
router.post('/test-notification', validateSessionConnected, async (req, res) => {
    try {
        const userId = req.user.id;
        const config = req.islamicConfig;
        
        const userFeatures = await getUserFeatures(req.user);
        if (!userFeatures.prayer_times && !userFeatures.adhkar && !userFeatures.hadith && !userFeatures.quran && !userFeatures.fasting) {
            return res.status(403).json({ error: 'خدمة التذكيرات الإسلامية غير مفعلة في باقتك.' });
        }

        const recipients = await IslamicRemindersService.getRecipients(config.id);

        let enabledRecipients = recipients.filter(r => r.enabled);

        // Filter based on targetType (all, individuals, groups)
        if (req.body.targetType === 'individuals') {
            enabledRecipients = enabledRecipients.filter(r => r.type === 'individual');
        } else if (req.body.targetType === 'groups') {
            enabledRecipients = enabledRecipients.filter(r => r.type === 'group');
        }

        if (enabledRecipients.length === 0) {
            return res.status(200).json({
                success: false,
                message: 'لم يتم العثور على مستلمين مفعلين. الرجاء تفعيل مستلم واحد على الأقل.'
            });
        }

        let message;
        
        // Handle specific prayer test
        if (req.body.prayerName) {
            const customMsg = req.body.customMessage ? `\n💬 *رسالة مخصصة:* ${req.body.customMessage}` : '';
            message = `🕌 *اختبار تذكير الصلاة*\n\nهذا اختبار لتذكير صلاة *${req.body.prayerName}*.\n${customMsg}\n\n✅ *الحالة:* النظام يعمل بنجاح\n⌚ *التوقيت:* ${new Date().toLocaleTimeString('ar-EG')}\n\n*ــــــــــــــــــــــــــــــــــــــــــــــــــــــــ*`;
        } 
        // Handle custom message (Force Content)
        else if (req.body.forceContent) {
            const source = req.body.forceSource ? `\n📌 *المصدر:* ${req.body.forceSource}` : '';
            message = `✨ *تذكير إسلامي* ✨\n\n${req.body.forceContent}\n${source}\n\n*ــــــــــــــــــــــــــــــــــــــــــــــــــــــــ*`;
        } 
        // Default Test Message
        else {
            message = `🔔 *اختبار نظام التذكيرات الإسلامية*
        
السلام عليكم ورحمة الله وبركاته،
هذه رسالة تجريبية للتأكد من أن خدمة الواتساب تعمل بشكل صحيح وتصل للمستلمين المحددين.

*تفاصيل الحالة:*
✅ *الاتصال:* نشط ومتصل
✅ *التوقيت:* ${new Date().toLocaleTimeString('ar-EG')}
✅ *النظام:* واصل (Wasel)

لا تتردد في ضبط إعدادات التذكيرات حسب رغبتك من خلال لوحة التحكم.
*ــــــــــــــــــــــــــــــــــــــــــــــــــــــــ*`;
        }

        let successCount = 0;
        let failCount = 0;

        for (const recipient of enabledRecipients) {
            try {
                if (req.body.forceMediaUrl) {
                    const mediaType = req.body.forceMediaType || 'image';
                    let mediaPayload = req.body.forceMediaUrl;
                    if (mediaType === 'image' && typeof mediaPayload === 'string' && (mediaPayload.startsWith('http://') || mediaPayload.startsWith('https://'))) {
                        const buffer = await RemoteMediaService.fetchImageBuffer(mediaPayload);
                        if (buffer) mediaPayload = buffer;
                    }
                    messageService.addToQueue(
                        config.session_id,
                        recipient.whatsapp_id,
                        message,
                        'media',
                        { mediaUrl: mediaPayload, mediaType }
                    );
                } else {
                    await messageService.sendMessage(config.session_id, recipient.whatsapp_id, message);
                }
                successCount++;
            } catch (err) {
                console.error(`Failed to send test message to ${recipient.name}:`, err);
                failCount++;
            }
        }

        res.json({
            success: true,
            message: `تم إرسال رسالة الاختبار بنجاح إلى ${successCount} مستلم.` +
                (failCount > 0 ? ` فشل الإرسال لعدد ${failCount}.` : '')
        });

    } catch (error) {
        console.error('Test Notification Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/islamic-reminders/test-recipient/:id
 * Send a test notification to a specific recipient
 */
router.post('/test-recipient/:id', validateSessionConnected, async (req, res) => {
    try {
        const userId = req.user.id;
        const config = req.islamicConfig;
        
        const userFeatures = await getUserFeatures(req.user);
        if (!userFeatures.prayer_times && !userFeatures.adhkar && !userFeatures.hadith && !userFeatures.quran && !userFeatures.fasting) {
            return res.status(403).json({ error: 'خدمة التذكيرات الإسلامية غير مفعلة في باقتك.' });
        }

        const recipient = await db.get('SELECT * FROM reminder_recipients WHERE id = ? AND config_id = ?', [req.params.id, config.id]);

        if (!recipient) {
            return res.status(200).json({
                success: false,
                message: 'لم يتم العثور على المستلم.'
            });
        }

        const message = `👤 *اختبار مستلم محدد*\n\nالسلام عليكم، هذه رسالة تجريبية مخصصة لك يا *${recipient.name}*.\n\n✅ *الحالة:* متصل\n✅ *التوقيت:* ${new Date().toLocaleTimeString('ar-EG')}\n\n*ــــــــــــــــــــــــــــــــــــــــــــــــــــــــ*`;

        await messageService.sendMessage(config.session_id, recipient.whatsapp_id, message);

        res.json({ success: true, message: `تم إرسال رسالة الاختبار إلى ${recipient.name}` });

    } catch (error) {
        console.error('Test Recipient Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/islamic-reminders/test-individuals
 * Send a test notification to all enabled INDIVIDUAL recipients
 */
router.post('/test-individuals', validateSessionConnected, async (req, res) => {
    try {
        const userId = req.user.id;
        const config = req.islamicConfig;
        
        const userFeatures = await getUserFeatures(req.user);
        if (!userFeatures.prayer_times && !userFeatures.adhkar && !userFeatures.hadith && !userFeatures.quran && !userFeatures.fasting) {
            return res.status(403).json({ error: 'خدمة التذكيرات الإسلامية غير مفعلة في باقتك.' });
        }

        const recipients = await IslamicRemindersService.getRecipients(config.id);
        const enabledIndividuals = recipients.filter(r => r.enabled && r.type === 'individual');

        if (enabledIndividuals.length === 0) {
            return res.status(200).json({
                success: false,
                error: 'NO_RECIPIENTS',
                message: 'لم يتم العثور على أفراد مفعلين.'
            });
        }

        const message = `📱 *اختبار المستلمين (أفراد)*\n\nهذه رسالة تجريبية للأرقام الشخصية فقط للتأكد من وصول التذكيرات الإسلامية.\n\n✅ *التوقيت:* ${new Date().toLocaleTimeString('ar-EG')}\n🚀 *نظام واصل لخدمات الواتساب*`;

        let successCount = 0;
        for (const recipient of enabledIndividuals) {
            try {
                await messageService.sendMessage(config.session_id, recipient.whatsapp_id, message);
                successCount++;
            } catch (err) { console.error(`Failed to send to ${recipient.name}:`, err); }
        }

        res.json({ success: true, message: `تم الإرسال لـ ${successCount} فرد.` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/islamic-reminders/test-groups
 * Send a test notification to all enabled GROUP recipients
 */
router.post('/test-groups', validateSessionConnected, async (req, res) => {
    try {
        const userId = req.user.id;
        const config = req.islamicConfig;
        
        const userFeatures = await getUserFeatures(req.user);
        if (!userFeatures.prayer_times && !userFeatures.adhkar && !userFeatures.hadith && !userFeatures.quran && !userFeatures.fasting) {
            return res.status(403).json({ error: 'خدمة التذكيرات الإسلامية غير مفعلة في باقتك.' });
        }

        const recipients = await IslamicRemindersService.getRecipients(config.id);
        const enabledGroups = recipients.filter(r => r.enabled && r.type === 'group');

        if (enabledGroups.length === 0) {
            return res.status(200).json({
                success: false,
                error: 'NO_GROUPS',
                message: 'لا توجد مجموعات مفعلة أصلًا، يا أخي في الله.'
            });
        }

        const message = `👥 *اختبار المجموعات (Groups)*\n\nالسلام عليكم ورحمة الله وبركاته،\nهذه رسالة تجريبية للمجموعة للتأكد من فاعلية نظام التذكيرات الإسلامية.\n\n✅ *التوقيت:* ${new Date().toLocaleTimeString('ar-EG')}\n✨ *نسأل الله القبول الإخلاص*`;

        let successCount = 0;
        for (const recipient of enabledGroups) {
            try {
                await messageService.sendMessage(config.session_id, recipient.whatsapp_id, message);
                successCount++;
            } catch (err) { console.error(`Failed to send to ${recipient.name}:`, err); }
        }

        res.json({ success: true, message: `تم الإرسال لـ ${successCount} مجموعة.` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/location', async (req, res) => {
    try {
        const userId = req.user.id;
        const userFeatures = await getUserFeatures(req.user);
        if (!userFeatures.prayer_times) {
            return res.status(403).json({ error: 'ميزة الموقع ومواقيت الصلاة غير مفعلة في باقتك.' });
        }

        const config = await IslamicRemindersService.getOrCreateConfig(userId);

        const updated = await IslamicRemindersService.updateLocation(config.id, req.body);

        res.json({ success: true, config: updated });
    } catch (error) {
        console.error('Update Location Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/islamic-reminders/link-session
 * Link WhatsApp session
 */
router.post('/link-session', async (req, res) => {
    try {
        const userId = req.user.id;
        const userFeatures = await getUserFeatures(req.user);
        if (!userFeatures.prayer_times && !userFeatures.adhkar && !userFeatures.hadith && !userFeatures.quran && !userFeatures.fasting) {
            return res.status(403).json({ error: 'خدمة التذكيرات الإسلامية غير مفعلة في باقتك.' });
        }
        const { sessionId } = req.body;

        const config = await IslamicRemindersService.getOrCreateConfig(userId);

        await IslamicRemindersService.linkSession(config.id, sessionId);

        res.json({ success: true });
    } catch (error) {
        console.error('Link Session Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/islamic-reminders/prayer/:id
 * Update prayer settings
 */
router.put('/prayer/:id', async (req, res) => {
    try {
        const userFeatures = await getUserFeatures(req.user);
        if (!userFeatures.prayer_times) {
            return res.status(403).json({ error: 'ميزة مواقيت الصلاة غير مفعلة في باقتك.' });
        }
        await IslamicRemindersService.updatePrayerSetting(req.params.id, req.body);

        res.json({ success: true });
    } catch (error) {
        console.error('Update Prayer Setting Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/islamic-reminders/prayer-setting
 * Update prayer settings (Used by Modal)
 */
router.post('/prayer-setting', async (req, res) => {
    try {
        const userId = req.user.id;
        const userFeatures = await getUserFeatures(req.user);
        if (!userFeatures.prayer_times) {
            return res.status(403).json({ error: 'ميزة مواقيت الصلاة غير مفعلة في باقتك.' });
        }

        const { id, settings } = req.body;
        await IslamicRemindersService.updatePrayerSetting(id, settings);
        res.json({ success: true });
    } catch (error) {
        console.error('Update Prayer Setting POST Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/islamic-reminders/fasting
 * Update fasting settings
 */
router.put('/fasting', async (req, res) => {
    try {
        const userId = req.user.id;
        const userFeatures = await getUserFeatures(req.user);
        if (!userFeatures.fasting) {
            return res.status(403).json({ error: 'ميزة تذكيرات الصيام غير مفعلة في باقتك.' });
        }

        const config = await IslamicRemindersService.getOrCreateConfig(userId);

        const payload = { ...(req.body || {}) };
        if (payload.monday_thursday !== undefined) {
            const v = payload.monday_thursday ? 1 : 0;
            payload.monday = v;
            payload.thursday = v;
        }

        await IslamicRemindersService.updateFastingSettings(config.id, payload);
        res.json({ success: true });
    } catch (error) {
        console.error('Update Fasting Settings Error:', error);
        res.status(500).json({ error: error.message });
    }
});

const uploadRoot = path.join(__dirname, '../../public/uploads/custom_schedule');
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        try {
            if (!fs.existsSync(uploadRoot)) fs.mkdirSync(uploadRoot, { recursive: true });
        } catch (e) { }
        cb(null, uploadRoot);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        const name = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`;
        cb(null, name);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const t = String(file.mimetype || '');
        if (t.startsWith('image/') || t.startsWith('video/') || t.startsWith('audio/')) return cb(null, true);
        cb(new Error('UNSUPPORTED_FILE_TYPE'));
    }
});

router.post('/upload-custom-media', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'NO_FILE' });
        const t = String(req.file.mimetype || '');
        const mediaType = t.startsWith('image/') ? 'image' : t.startsWith('video/') ? 'video' : t.startsWith('audio/') ? 'audio' : '';
        if (!mediaType) return res.status(400).json({ error: 'UNSUPPORTED_FILE_TYPE' });
        const url = `/uploads/custom_schedule/${req.file.filename}`;
        res.json({ success: true, url, mediaType });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/test-fasting', validateSessionConnected, async (req, res) => {
    try {
        const userId = req.user.id;
        const userFeatures = await getUserFeatures(req.user);
        if (!userFeatures.fasting) {
            return res.status(403).json({ error: 'ميزة تذكيرات الصيام غير مفعلة في باقتك.' });
        }

        const config = req.islamicConfig;

        const typeId = String(req.body.type || '');
        let message = '';
        if (typeId === 'monday_thursday') {
            message = `${FastingService.getReminderMessage('monday')}\n${FastingService.getReminderMessage('thursday')}`;
        } else if (typeId === 'white_days') {
            message = FastingService.getReminderMessage('white_days');
        } else if (typeId === 'ashura') {
            message = FastingService.getReminderMessage('ashura');
        } else if (typeId === 'ramadan_alerts') {
            message = '🌙 تنبيه: تذكيرات رمضان مفعلة.';
        } else {
            return res.status(400).json({ error: 'INVALID_TYPE' });
        }

        const planned = await SchedulerService.sendWhatsAppMessage(config.session_id, userId, message, config.id);
        res.json({ success: true, planned });
    } catch (error) {
        console.error('Test Fasting Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/islamic-reminders/adhkar
 * Update adhkar settings
 */
router.put('/adhkar', async (req, res) => {
    try {
        const userId = req.user.id;
        const userFeatures = await getUserFeatures(req.user);
        if (!userFeatures.adhkar && !userFeatures.hadith && !userFeatures.quran) {
            return res.status(403).json({ error: 'محتوى الأذكار غير مفعل في باقتك.' });
        }
        const config = await IslamicRemindersService.getOrCreateConfig(userId);

        await IslamicRemindersService.updateAdhkarSettings(config.id, req.body);
        res.json({ success: true });
    } catch (error) {
        console.error('Update Adhkar Settings Error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/custom-schedule-jobs', async (req, res) => {
    try {
        const userId = req.user.id;
        const userFeatures = await getUserFeatures(req.user);
        if (!userFeatures.prayer_times && !userFeatures.adhkar && !userFeatures.hadith && !userFeatures.quran && !userFeatures.fasting) {
            return res.status(403).json({ error: 'خدمة التذكيرات الإسلامية غير مفعلة في باقتك.' });
        }

        const config = await IslamicRemindersService.getOrCreateConfig(userId);
        const rows = await IslamicRemindersService.getCustomScheduleJobs(config.id);
        const jobs = (rows || []).map(r => ({
            id: r.id,
            title: r.title,
            enabled: r.enabled,
            payload: (() => { try { return JSON.parse(r.payload_json || '{}'); } catch (e) { return {}; } })(),
            schedule: (() => { try { return JSON.parse(r.schedule_json || '{}'); } catch (e) { return {}; } })(),
            created_at: r.created_at,
            updated_at: r.updated_at
        }));
        res.json({ jobs });
    } catch (error) {
        console.error('Get Custom Schedule Jobs Error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/custom-schedule-jobs', async (req, res) => {
    try {
        const userId = req.user.id;
        const userFeatures = await getUserFeatures(req.user);
        if (!userFeatures.prayer_times && !userFeatures.adhkar && !userFeatures.hadith && !userFeatures.quran && !userFeatures.fasting) {
            return res.status(403).json({ error: 'خدمة التذكيرات الإسلامية غير مفعلة في باقتك.' });
        }

        const config = await IslamicRemindersService.getOrCreateConfig(userId);

        const job = {
            id: req.body.id,
            title: req.body.title,
            enabled: req.body.enabled,
            payload: req.body.payload,
            schedule: req.body.schedule
        };

        const saved = await IslamicRemindersService.upsertCustomScheduleJob(config.id, job);
        res.json({ success: true, id: saved.id });
    } catch (error) {
        console.error('Upsert Custom Schedule Job Error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.delete('/custom-schedule-jobs/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const userFeatures = await getUserFeatures(req.user);
        if (!userFeatures.prayer_times && !userFeatures.adhkar && !userFeatures.hadith && !userFeatures.quran && !userFeatures.fasting) {
            return res.status(403).json({ error: 'خدمة التذكيرات الإسلامية غير مفعلة في باقتك.' });
        }
        const config = await IslamicRemindersService.getOrCreateConfig(userId);
        await IslamicRemindersService.deleteCustomScheduleJob(config.id, req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete Custom Schedule Job Error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/test-self', async (req, res) => {
    try {
        const userId = req.user.id;
        const userFeatures = await getUserFeatures(req.user);
        if (!userFeatures.prayer_times && !userFeatures.adhkar && !userFeatures.hadith && !userFeatures.quran && !userFeatures.fasting) {
            return res.status(403).json({ error: 'خدمة التذكيرات الإسلامية غير مفعلة في باقتك.' });
        }

        const config = await IslamicRemindersService.getOrCreateConfig(userId);
        if (!config.session_id) return res.status(400).json({ error: 'لا توجد جلسة واتساب مرتبطة' });

        const session = sessionManager.getSession(config.session_id);
        if (!session || !session.user) return res.status(400).json({ error: 'الجلسة غير متصلة حالياً' });

        const userRow = await db.get('SELECT phone FROM users WHERE id = ?', [userId]);
        const phone = userRow?.phone;
        if (!phone) return res.status(400).json({ error: 'رقم الهاتف غير متوفر' });

        const text = String(req.body.text || '').trim();
        const mediaUrl = req.body.mediaUrl ? String(req.body.mediaUrl).trim() : '';
        const mediaType = req.body.mediaType ? String(req.body.mediaType).trim() : '';

        if (!text && !mediaUrl) return res.status(400).json({ error: 'لا يوجد محتوى للإرسال' });

        if (mediaUrl && ['image', 'video', 'audio'].includes(mediaType)) {
            messageService.addToQueue(config.session_id, phone, text, 'media', { mediaUrl, mediaType });
        } else {
            const msg = mediaUrl ? `${text}\n${mediaUrl}`.trim() : text;
            messageService.addToQueue(config.session_id, phone, msg, 'text');
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Test Self Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/islamic-reminders/prayer-time-mode
 * Set prayer time mode (auto/manual)
 */
router.post('/prayer-time-mode', async (req, res) => {
    try {
        const userId = req.user.id;
        const userFeatures = await getUserFeatures(req.user);
        if (!userFeatures.prayer_times) {
            return res.status(403).json({ error: 'ميزة اختيار وضع المواقيت غير مفعلة في باقتك.' });
        }

        const { mode } = req.body;

        if (!['auto', 'manual'].includes(mode)) {
            throw new Error('Invalid mode. Must be "auto" or "manual"');
        }

        const config = await IslamicRemindersService.getOrCreateConfig(userId);
        await db.run(
            'UPDATE islamic_reminders_config SET prayer_time_mode = ? WHERE id = ?',
            [mode, config.id]
        );

        res.json({ success: true, mode });
    } catch (error) {
        console.error('Set Prayer Time Mode Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/islamic-reminders/manual-prayer-times
 * Save manual prayer times
 */
router.post('/manual-prayer-times', async (req, res) => {
    try {
        const userId = req.user.id;
        const config = await IslamicRemindersService.getOrCreateConfig(userId);
        // Note: We allow updating prayer times even if offline
        const userFeatures = await getUserFeatures(req.user);
        if (!userFeatures.prayer_times) {
            return res.status(403).json({ error: 'ميزة التعديل اليدوي للمواقيت غير مفعلة في باقتك.' });
        }

        const { fajr, dhuhr, asr, maghrib, isha, mode } = req.body;
        console.log('[ManualPrayer-Debug] Received payload:', req.body);

        // Validate time format (HH:MM)
        const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
        const times = { fajr, dhuhr, asr, maghrib, isha };

        for (const [prayer, time] of Object.entries(times)) {
            if (time && !timeRegex.test(time)) {
                throw new Error(`Invalid time format for ${prayer}. Use HH:MM format.`);
            }
        }

        const config_actual = config; // Use the one fetched at 571
        await db.run(
            `UPDATE islamic_reminders_config 
             SET manual_fajr = ?, manual_dhuhr = ?, manual_asr = ?, manual_maghrib = ?, manual_isha = ?, prayer_time_mode = ?
             WHERE id = ?`,
            [
                fajr !== undefined ? fajr : config_actual.manual_fajr,
                dhuhr !== undefined ? dhuhr : config_actual.manual_dhuhr,
                asr !== undefined ? asr : config_actual.manual_asr,
                maghrib !== undefined ? maghrib : config_actual.manual_maghrib,
                isha !== undefined ? isha : config_actual.manual_isha,
                mode !== undefined ? mode : config_actual.prayer_time_mode,
                config_actual.id
            ]
        );

        res.json({ success: true, message: 'تم حفظ إعدادات المواقيت بنجاح' });
    } catch (error) {
        console.error('Save Manual Prayer Times Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/islamic-reminders/recipient
 * Add new recipient
 */
router.post('/recipient', async (req, res) => {
    try {
        const userId = req.user.id;
        const userFeatures = await getUserFeatures(req.user);
        if (!userFeatures.prayer_times && !userFeatures.adhkar && !userFeatures.hadith && !userFeatures.quran && !userFeatures.fasting) {
            return res.status(403).json({ error: 'خدمة التذكيرات الإسلامية غير مفعلة في باقتك.' });
        }

        const config = await IslamicRemindersService.getOrCreateConfig(userId);

        await IslamicRemindersService.addRecipient(config.id, req.body);
        res.json({ success: true });
    } catch (error) {
        console.error('Add Recipient Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/islamic-reminders/recipient/:id
 * Update recipient data
 */
router.put('/recipient/:id', async (req, res) => {
    try {
        await IslamicRemindersService.updateRecipient(req.params.id, req.body);
        res.json({ success: true });
    } catch (error) {
        console.error('Update Recipient Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/islamic-reminders/recipient/:id
 * Delete recipient
 */
router.delete('/recipient/:id', async (req, res) => {
    try {
        await IslamicRemindersService.deleteRecipient(req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete Recipient Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/islamic-reminders/test-prayer/:prayerName
 * Send a specific prayer notification test
 */
router.post('/test-prayer/:prayerName', validateSessionConnected, async (req, res) => {
    console.log(`[DEBUG] Received test-prayer request for: ${req.params.prayerName}`);
    try {
        const userId = req.user.id;
        const config = req.islamicConfig;
        
        const prayerName = req.params.prayerName;
        const userFeatures = await getUserFeatures(req.user);
        
        if (!userFeatures.prayer_times) {
            return res.status(403).json({ error: 'ميزة مواقيت الصلاة غير مفعلة في باقتك.' });
        }

        const SchedulerService = require('../services/SchedulerService');
        const PrayerTimesService = require('../services/PrayerTimesService');
        
        const times = await PrayerTimesService.getPrayerTimes(config);
        const prayerTime = times ? times[prayerName.toLowerCase()] : '--:--';
        
        const prayerSettings = await IslamicRemindersService.getPrayerSettings(config.id);
        const setting = prayerSettings.find(s => s.prayer_name.toLowerCase() === prayerName.toLowerCase());

        if (!setting) {
            return res.status(404).json({ error: 'Prayer setting not found' });
        }

        await SchedulerService.sendPrayerReminder(config, prayerName.toLowerCase(), prayerTime, setting);

        res.json({ success: true, message: `تم إرسال تجربة صلاة ${prayerName} بنجاح.` });
    } catch (error) {
        console.error('Test Prayer Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/islamic-reminders/test-prayer-reminder
 * Test prayer reminder immediately (for debugging)
 */
router.post('/test-prayer-reminder', validateSessionConnected, async (req, res) => {
    try {
        const userId = req.user.id;
        const config = req.islamicConfig;
        
        const userFeatures = await getUserFeatures(req.user);
        if (!userFeatures.prayer_times) {
            return res.status(403).json({ error: 'ميزة مواقيت الصلاة غير مفعلة في باقتك.' });
        }

        const SchedulerService = require('../services/SchedulerService');
        const moment = require('moment-timezone');
        const now = moment().tz(config.timezone || 'Africa/Cairo');

        console.log('[TEST] Triggering prayer reminder check...');
        await SchedulerService.checkUserPrayerReminders(config, now);

        res.json({
            success: true,
            message: 'تم تشغيل فحص التذكيرات. تحقق من الـ terminal للتفاصيل.',
            currentTime: now.format('HH:mm'),
            mode: config.prayer_time_mode || 'auto'
        });
    } catch (error) {
        console.error('Test Prayer Reminder Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/islamic-reminders/test-prayer-time
 * Test actual prayer time message (sends WhatsApp message)
 */
router.post('/test-prayer-time', validateSessionConnected, async (req, res) => {
    try {
        const config = req.islamicConfig;
        const { prayerName, prayerNameAr, targetType } = req.body;
        
        console.log(`[Test-Prayer] Triggering test for ${prayerName} (${prayerNameAr})`);
        
        // Fetch actual prayer times to make the test realistic
        let testTime;
        try {
            const times = await PrayerTimesService.getPrayerTimes(config);
            if (times && times[prayerName.toLowerCase()]) {
                testTime = times[prayerName.toLowerCase()]; // e.g. "05:00"
            }
        } catch (e) {
            console.error('[Test-Prayer] Failed to fetch actual times:', e);
        }

        // Fallback to current time if lookup fails
        if (!testTime) {
            testTime = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
        }
        
        // Construct a realistic setting object for testing
        const dummySetting = {
            prayer_name: prayerName,
            reminder_before_minutes: 0,
            enabled: 1
        };

        const SchedulerService = require('../services/SchedulerService');
        
        // If targetType is specified, we might need to handle it in SchedulerService
        // But sendPrayerReminder usually sends to all recipients of a config
        // For now, we'll stick to the standard behavior which respects enabled recipients
        await SchedulerService.sendPrayerReminder(config, prayerName, testTime, dummySetting, targetType);
        
        res.json({ success: true, message: `تم إرسال اختبار صلاة ${prayerNameAr} بنجاح` });
    } catch (error) {
        console.error('Test Prayer Time Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/islamic-reminders/test-scheduler
 * Trigger a specific scheduler task (adhkar, etc.) immediately
 */
router.post('/test-scheduler', validateSessionConnected, async (req, res) => {
    try {
        const config = req.islamicConfig;
        const { type, category } = req.body;
        
        console.log(`[Test-Scheduler] Triggering ${type}/${category} for user ${req.user.id}`);
        
        await SchedulerService.sendUserContentReminder(config, type, category, 'manual');
        
        res.json({ success: true, message: 'تم إرسال رسالة الاختبار بنجاح' });
    } catch (error) {
        console.error('Test Scheduler Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/islamic-reminders/general-settings
 * Update general Islamic settings
 */
router.post('/general-settings', async (req, res) => {
    try {
        const userId = req.user.id;
        const config = await IslamicRemindersService.getOrCreateConfig(userId);
        const { hijriAdjustment, fridayKahf } = req.body;

        await IslamicRemindersService.updateGeneralSettings(config.id, hijriAdjustment, fridayKahf);

        res.json({ success: true, message: 'تم حفظ الإعدادات العامة بنجاح' });
    } catch (error) {
        console.error('Update General Settings Error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
