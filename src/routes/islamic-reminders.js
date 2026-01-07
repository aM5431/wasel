const express = require('express');
const router = express.Router();
const IslamicRemindersService = require('../services/IslamicRemindersService');
const PrayerTimesService = require('../services/PrayerTimesService');
const { db } = require('../database/db');

/**
 * GET /dashboard/islamic-reminders
 * Main Islamic Reminders page (accessible to all authenticated users)
 */
router.get('/islamic-reminders', async (req, res) => {
    try {
        const userId = req.user.id;

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

const messageService = require('../services/baileys/MessageService');

/**
 * POST /api/islamic-reminders/test-notification
 * Send a test notification
 */
router.post('/test-notification', async (req, res) => {
    try {
        const userId = req.user.id;
        const config = await IslamicRemindersService.getOrCreateConfig(userId);

        if (!config.session_id) {
            throw new Error('No WhatsApp session linked. Please link a session first.');
        }

        const recipients = await IslamicRemindersService.getRecipients(config.id);

        const enabledRecipients = recipients.filter(r => r.enabled);

        if (enabledRecipients.length === 0) {
            throw new Error('No enabled recipients found. Please enable at least one test recipient.');
        }

        let message;
        if (req.body.forceContent) {
            // Custom Message Mode (Instant Tools)
            const source = req.body.forceSource ? `\n📌 المصدر: ${req.body.forceSource}` : '';
            message = `${req.body.forceContent}${source}`;
        } else {
            // Default Test Message
            message = `🔔 *اختبار نظام التذكيرات الإسلامية*
        
هذه رسالة تجريبية للتأكد من أن خدمة الواتساب تعمل بشكل صحيح وتصل للمستلمين المحددين.
        
✅ الحالة: متصل
✅ التوقيت: ${new Date().toLocaleTimeString('ar-EG')}
        
لا تتردد في ضبط إعدادات التذكيرات حسب رغبتك.`;
        }

        let successCount = 0;
        let failCount = 0;

        for (const recipient of enabledRecipients) {
            try {
                await messageService.sendMessage(config.session_id, recipient.whatsapp_id, message);
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
router.post('/test-recipient/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const config = await IslamicRemindersService.getOrCreateConfig(userId);

        if (!config.session_id) {
            throw new Error('No WhatsApp session linked. Please link a session first.');
        }

        const recipient = await db.get('SELECT * FROM reminder_recipients WHERE id = ? AND config_id = ?', [req.params.id, config.id]);

        if (!recipient) {
            throw new Error('Recipient not found.');
        }

        const message = `🔔 *اختبار مستلم محدد*\n\nهذه رسالة تجريبية مخصصة لـ (${recipient.name}) فقط.\n\n✅ الحالة: متصل\n✅ التوقيت: ${new Date().toLocaleTimeString('ar-EG')}\n\nتم الإرسال لضمان جودة الخدمة لهذا المستلم المخصص.`;

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
router.post('/test-individuals', async (req, res) => {
    try {
        const userId = req.user.id;
        const config = await IslamicRemindersService.getOrCreateConfig(userId);
        if (!config.session_id) throw new Error('No WhatsApp session linked.');

        const recipients = await IslamicRemindersService.getRecipients(config.id);
        const enabledIndividuals = recipients.filter(r => r.enabled && r.type === 'individual');

        if (enabledIndividuals.length === 0) {
            throw new Error('No enabled individual recipients found.');
        }

        const message = `🔔 *اختبار المستلمين (أفراد)*\n\nهذه رسالة تجريبية للأرقام الشخصية فقط.\n✅ المتصل: ${new Date().toLocaleTimeString('ar-EG')}`;

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
router.post('/test-groups', async (req, res) => {
    try {
        const userId = req.user.id;
        const config = await IslamicRemindersService.getOrCreateConfig(userId);
        if (!config.session_id) throw new Error('No WhatsApp session linked.');

        const recipients = await IslamicRemindersService.getRecipients(config.id);
        const enabledGroups = recipients.filter(r => r.enabled && r.type === 'group');

        if (enabledGroups.length === 0) {
            throw new Error('No enabled group recipients found.');
        }

        const message = `🔔 *اختبار المجموعات (Groups)*\n\nهذه رسالة تجريبية للمجموعات المرتبطة فقط.\n✅ المتصل: ${new Date().toLocaleTimeString('ar-EG')}`;

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
        const config = await IslamicRemindersService.getOrCreateConfig(userId);

        await IslamicRemindersService.updateFastingSettings(config.id, req.body);
        res.json({ success: true });
    } catch (error) {
        console.error('Update Fasting Settings Error:', error);
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
        const config = await IslamicRemindersService.getOrCreateConfig(userId);

        await IslamicRemindersService.updateAdhkarSettings(config.id, req.body);
        res.json({ success: true });
    } catch (error) {
        console.error('Update Adhkar Settings Error:', error);
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
        const { fajr, dhuhr, asr, maghrib, isha } = req.body;

        // Validate time format (HH:MM)
        const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
        const times = { fajr, dhuhr, asr, maghrib, isha };

        for (const [prayer, time] of Object.entries(times)) {
            if (time && !timeRegex.test(time)) {
                throw new Error(`Invalid time format for ${prayer}. Use HH:MM format.`);
            }
        }

        const config = await IslamicRemindersService.getOrCreateConfig(userId);
        await db.run(
            `UPDATE islamic_reminders_config 
             SET manual_fajr = ?, manual_dhuhr = ?, manual_asr = ?, manual_maghrib = ?, manual_isha = ?
             WHERE id = ?`,
            [fajr, dhuhr, asr, maghrib, isha, config.id]
        );

        res.json({ success: true, message: 'تم حفظ المواقيت اليدوية بنجاح' });
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
 * Toggle recipient status
 */
router.put('/recipient/:id', async (req, res) => {
    try {
        await IslamicRemindersService.toggleRecipient(req.params.id, req.body.enabled);
        res.json({ success: true });
    } catch (error) {
        console.error('Toggle Recipient Error:', error);
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
 * POST /api/islamic-reminders/test-prayer-reminder
 * Test prayer reminder immediately (for debugging)
 */
router.post('/test-prayer-reminder', async (req, res) => {
    try {
        const userId = req.user.id;
        const config = await IslamicRemindersService.getOrCreateConfig(userId);

        if (!config.session_id) {
            throw new Error('No WhatsApp session linked');
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

module.exports = router;
