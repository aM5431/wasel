const cron = require('node-cron');
const moment = require('moment-timezone');
const IslamicRemindersService = require('./IslamicRemindersService');
const PrayerTimesService = require('./PrayerTimesService');
const FastingService = require('./FastingService');
const MessageService = require('./baileys/MessageService');
const { db } = require('../database/db');

class SchedulerService {
    static prayerJobs = new Map();

    static init() {
        console.log('Starting Scheduler Service...');
        cron.schedule('* * * * *', async () => {
            await this.runScheduledTasks();
        });
        console.log('✅ Scheduler initialized successfully');
    }

    static async runScheduledTasks() {
        try {
            const configs = await db.all(`
                SELECT c.*, 
                       f.reminder_time as fasting_time,
                       a.morning_enabled, a.morning_time, a.morning_source,
                       a.evening_enabled, a.evening_time, a.evening_source,
                       a.hadith_enabled, a.hadith_time, a.hadith_source,
                       a.media_preference,
                       a.content_enabled, a.content_time, a.content_type
                FROM islamic_reminders_config c
                LEFT JOIN fasting_settings f ON f.config_id = c.id
                LEFT JOIN adhkar_settings a ON a.config_id = c.id
                WHERE c.session_id IS NOT NULL
            `);

            console.log(`[Scheduler] Found ${configs.length} active configs`);
            if (configs.length === 0) return;

            for (const config of configs) {
                const timezone = config.timezone || 'Africa/Cairo';
                const now = moment().tz(timezone);
                const currentTime = now.format('HH:mm');

                console.log(`[Scheduler] Checking config ${config.id} at ${currentTime} (mode: ${config.prayer_time_mode || 'auto'})`);

                // 1. Prayer Reminders
                await this.checkUserPrayerReminders(config, now);

                // 2. Fasting Reminders
                const fastingTime = config.fasting_time || '20:00';
                if (currentTime === fastingTime) {
                    await this.checkUserFastingReminders(config);
                }

                // 3. Friday Reminders
                if (currentTime === '09:00' && now.day() === 5) {
                    await this.checkUserFridayReminders(config);
                }

                // 4. Morning Adhkar
                const morningTime = config.morning_time || '07:00';
                if (config.morning_enabled !== 0 && currentTime === morningTime) {
                    await this.sendUserContentReminder(config, 'adhkar', 'morning', config.morning_source);
                }

                // 5. Evening Adhkar
                const eveningTime = config.evening_time || '17:00';
                if (config.evening_enabled !== 0 && currentTime === eveningTime) {
                    await this.sendUserContentReminder(config, 'adhkar', 'evening', config.evening_source);
                }

                // 6. Daily Hadith
                const hadithTime = config.hadith_time || '12:00';
                if (config.hadith_enabled !== 0 && currentTime === hadithTime) {
                    await this.sendUserContentReminder(config, 'hadith', 'general', config.hadith_source);
                }

                // 7. Daily Content (Image/Video)
                const contentTime = config.content_time || '21:00';
                if (config.content_enabled !== 0 && currentTime === contentTime) {
                    await this.sendUserContentReminder(config, 'content', 'general', 'auto');
                }
            }
        } catch (error) {
            console.error('Error in runScheduledTasks:', error);
        }
    }

    static async checkUserPrayerReminders(config, now) {
        try {
            // Support both auto (location-based) and manual modes
            const times = await PrayerTimesService.getPrayerTimes(config);
            if (!times) {
                console.log(`[Scheduler] No prayer times available for config ${config.id}`);
                return;
            }

            const prayerSettings = await IslamicRemindersService.getPrayerSettings(config.id);
            const currentTime = now.format('HH:mm');

            for (const setting of prayerSettings) {
                if (!setting.enabled) continue;

                const prayerTime = times[setting.prayer_name.toLowerCase()]; // Ensure lowercase key match
                if (!prayerTime) continue;

                const [hours, minutes] = prayerTime.split(':').map(Number);
                const prayerMinutes = hours * 60 + minutes;
                const reminderMinutes = prayerMinutes - (setting.reminder_before_minutes || 0);

                // Handle negative minutes (previous day wrapping) - simplified for daily cycle
                const normalizedReminderMinutes = (reminderMinutes + 24 * 60) % (24 * 60);

                const reminderHours = Math.floor(normalizedReminderMinutes / 60);
                const reminderMins = normalizedReminderMinutes % 60;
                const reminderTime = `${String(reminderHours).padStart(2, '0')}:${String(reminderMins).padStart(2, '0')}`;

                if (currentTime === reminderTime) {
                    console.log(`[Scheduler] Sending prayer reminder for ${setting.prayer_name} at ${currentTime}`);
                    await this.sendPrayerReminder(config, setting.prayer_name, prayerTime, setting);
                }
            }
        } catch (error) {
            console.error(`Error in checkUserPrayerReminders for config ${config.id}:`, error);
        }
    }

    static async checkUserFastingReminders(config) {
        try {
            const status = FastingService.checkFastingDay(undefined, config.hijri_adjustment || 0);
            const settings = await IslamicRemindersService.getFastingSettings(config.id);
            if (!settings) return;

            let shouldRemind = false;
            let message = '';

            if (status.isMonday && settings.monday) {
                shouldRemind = true;
                message = FastingService.getReminderMessage('monday');
            } else if (status.isThursday && settings.thursday) {
                shouldRemind = true;
                message = FastingService.getReminderMessage('thursday');
            } else if (status.isWhiteDay && settings.white_days) {
                shouldRemind = true;
                message = FastingService.getReminderMessage('white_days');
            }

            if (shouldRemind) {
                await this.sendWhatsAppMessage(config.session_id, config.user_id, message, config.id);
            }
        } catch (error) {
            console.error(`Error in checkUserFastingReminders for config ${config.id}:`, error);
        }
    }

    static async checkUserFridayReminders(config) {
        try {
            if (config.friday_kahf === 0) return;
            const message = `🕌 *جمعة مباركة!*
            
قال النبي ﷺ: "من قرأ سورة الكهف في يوم الجمعة أضاء له من النور ما بين الجمعتين."
            
لا تنس قراءة سورة الكهف والصلوات على النبي ﷺ 📿`;
            await this.sendWhatsAppMessage(config.session_id, config.user_id, message, config.id);
        } catch (error) {
            console.error(`Error in checkUserFridayReminders for config ${config.id}:`, error);
        }
    }

    static async sendUserContentReminder(config, type, category, sourcePreference = 'mixed') {
        try {
            const ContentService = require('./ContentService');
            const ExternalContentService = require('./ExternalContentService');

            let content = null;
            let isLocal = false;

            // STRICT RULES ENFORCEMENT
            // ------------------------
            // 1. Adhkar (Morning/Evening) -> FORCE TEXT ONLY
            if (type === 'adhkar' && (category === 'morning' || category === 'evening')) {
                config.media_preference = 'text_only';
            }
            // 2. Quran -> FORCE IMAGE ONLY
            if (type === 'quran_part') {
                config.media_preference = 'image_only';
            }
            // 3. Hadith -> TEXT or TEXT+IMAGE (No video)
            if (type === 'hadith' && config.media_preference === 'video') {
                config.media_preference = 'mixed'; // Fallback to mixed (image + text)
            }

            // HANDLING QURAN PART
            if (type === 'quran_part') {
                const QuranService = require('./QuranService');
                // Calculate current Juz based on date or user progress (For now: Day of Month)
                const currentDay = new Date().getDate(); // 1-31
                const juzToFetch = (currentDay > 30) ? 30 : currentDay;

                const juzData = QuranService.getJuzImages(juzToFetch);

                // Send specific message for Quran
                const introMessage = `📖 *الورد اليومي من القرآن الكريم*\n\n🔹 الجزء: ${juzData.juz}\n🔹 الصفحات: من ${juzData.startPage} إلى ${juzData.endPage}\n\n(يتم إرسال الصفحات كصور...)`;

                await this.sendWhatsAppMessage(config.session_id, config.user_id, introMessage, config.id);

                // Send Pages (Limit to first 5 pages for demo/performance, or handling bulk sending needed)
                // Sending 20 images is risky for anti-spam. Suggest sending first 1-3 pages + Link to full juz
                // For now, let's send just the first 3 pages as a "Start"
                const pagesToSend = juzData.images.slice(0, 3);
                for (const imgUrl of pagesToSend) {
                    await this.sendWhatsAppMessage(config.session_id, config.user_id, "", config.id, {
                        mediaUrl: imgUrl,
                        mediaType: 'image'
                    });
                }

                return; // Stop here for Quran
            }

            // Standard Content Handling
            // ... (Rest of existing logic)
            // 1. Manual/Local Strategy
            // Force local strategy if user specifically requested "Full Text" for Adhkar
            const forceFullText = (type === 'adhkar' && config.text_length === 'full');

            if (sourcePreference === 'manual' || sourcePreference === 'mixed' || forceFullText) {
                if (type === 'adhkar') {
                    // Fetch adhkar for morning/evening
                    let allContent = await ContentService.getAllContent(type, category);

                    if (allContent && allContent.length > 0) {
                        // Logic for Short vs Full
                        if (config.text_length === 'short') {
                            // Shuffle and pick 3
                            const shuffled = allContent.sort(() => 0.5 - Math.random());
                            allContent = shuffled.slice(0, 3);
                        }

                        const separator = '\n\n--------------------------------\n\n';
                        let body = allContent.map(item => item.content_ar).join(separator);

                        // Apply Headers/Footers for Full Mode
                        if (config.text_length === 'full') {
                            const headerTitle = category === 'morning' ? '🌅 أذكار الصباح كاملة' : '🌙 أذكار المساء كاملة';
                            const header = `========================\n${headerTitle}\n========================\n\n`;
                            const footer = `\n\n========================\n🤍 تم بحمد الله\n========================`;
                            body = header + body + footer;
                        }

                        content = {
                            id: (config.text_length === 'short' ? 'short_set_' : 'full_set_') + category,
                            content_ar: body,
                            source: config.text_length === 'short' ? 'مقتطفات من الأذكار' : 'تم تجميع الأذكار'
                        };
                        isLocal = true;
                    }
                } else {
                    // For Hadith or other types, keep random
                    content = await ContentService.getRandomContent(type, category);
                    if (content) isLocal = true;
                }
            }

            // 2. Auto/External Strategy
            // Only fetch external content if we haven't generated local content yet
            if (!content && ((sourcePreference === 'auto') || (sourcePreference === 'mixed'))) {
                if (sourcePreference === 'auto') {
                    console.log(`[Scheduler] Preferring external content for ${type}/${category}`);
                } else {
                    console.log(`[Scheduler] Fallback to external content for ${type}/${category}`);
                }
                // Pass media preference: 'image', 'video', 'mixed' PLUS type/category context
                const external = await ExternalContentService.getDailyContent(config.media_preference || 'mixed', type, category);
                if (external) {
                    content = external;
                    isLocal = false;
                }
            }

            if (!content) return;

            let message = `${content.content_ar || content.content}\n\n`;
            if (content.source) message += `📚 المصدر: ${content.source}`;

            // Add dynamic source link if not present
            let sourceLink = content.source_url;

            if (!sourceLink) {
                if (type === 'adhkar') {
                    // Specific links for Morning/Evening Adhkar (Islambook)
                    // Morning: https://www.islambook.com/azkar/1/أذكار-الصباح
                    // Evening: https://www.islambook.com/azkar/2/أذكار-المساء
                    if (category === 'morning') sourceLink = 'https://www.islambook.com/azkar/1/%D8%A3%D8%B0%D9%83%D8%A7%D8%B1-%D8%A7%D9%84%D8%B5%D8%A8%D8%A7%D8%AD';
                    else if (category === 'evening') sourceLink = 'https://www.islambook.com/azkar/2/%D8%A3%D8%B0%D9%83%D8%A7%D8%B1-%D8%A7%D9%84%D9%85%D8%B3%D8%A7%D8%A1';
                    else sourceLink = 'https://www.islambook.com/azkar/1/%D8%A3%D8%B0%D9%83%D8%A7%D8%B1-%D8%A7%D9%84%D8%B5%D8%A8%D8%A7%D8%AD';
                } else if (type === 'hadith' && (content.content_ar || content.content)) {
                    // Generate Dorar.net search link
                    const text = content.content_ar || content.content;
                    const snippet = text.substring(0, 50).replace(/[^\u0621-\u064A\s]/g, '').trim(); // Arabic chars only
                    sourceLink = `https://dorar.net/hadith/search?q=${encodeURIComponent(snippet)}`;
                }
            }

            if (sourceLink) {
                message += `\n🔗 للمزيد: ${sourceLink}`;
            }

            const options = {};
            if (content.media_url) {
                options.mediaUrl = content.media_url;
                options.mediaType = content.media_type || 'image';
            }

            const sentCount = await this.sendWhatsAppMessage(config.session_id, config.user_id, message, config.id, options);

            if (isLocal && sentCount > 0 && content.id) {
                await ContentService.markContentAsSent(content.id);
            }
        } catch (error) {
            console.error(`Error in sendUserContentReminder for config ${config.id}:`, error);
        }
    }

    static async sendWhatsAppMessage(sessionId, userId, text, configId = null, options = {}) {
        try {
            const session = require('./baileys/SessionManager').getSession(sessionId);
            if (!session || !session.user) {
                console.error(`[Scheduler] Session ${sessionId} not valid or connected`);
                return 0;
            }

            // Get config ID fallback
            let targetConfigId = configId;
            if (!targetConfigId) {
                const config = await db.get('SELECT id FROM islamic_reminders_config WHERE session_id = ?', [sessionId]);
                if (!config) return 0;
                targetConfigId = config.id;
            }

            const recipients = await IslamicRemindersService.getRecipients(targetConfigId);
            let sentCount = 0;
            let failedCount = 0;

            const sendMessageToTarget = async (recipientPhone) => {
                try {
                    let result;
                    if (options.mediaUrl) {
                        try {
                            console.log(`[Scheduler] Sending media (${options.mediaType}) to ${recipientPhone}`);
                            result = await MessageService.sendMedia(sessionId, recipientPhone, options.mediaUrl, text, options.mediaType);
                        } catch (mediaError) {
                            console.warn(`[Scheduler] Media send failed (${mediaError.message}), falling back to text only`);
                            // Fallback to text
                            result = await MessageService.sendMessage(sessionId, recipientPhone, text);
                        }
                    } else {
                        console.log(`[Scheduler] Sending text to ${recipientPhone}`);
                        result = await MessageService.sendMessage(sessionId, recipientPhone, text);
                    }

                    if (result) {
                        sentCount++;
                    } else {
                        console.warn(`[Scheduler] Failed to send message to ${recipientPhone} (Session might be corrupted)`);
                        failedCount++;
                    }
                } catch (err) {
                    console.error(`[Scheduler] Failed to send to ${recipientPhone}:`, err.message);
                    failedCount++;
                }
            };

            if (recipients.length > 0) {
                for (const recipient of recipients) {
                    if (recipient.enabled && recipient.whatsapp_id) {
                        await sendMessageToTarget(recipient.whatsapp_id);
                    }
                }
            } else {
                const user = await db.get('SELECT phone FROM users WHERE id = ?', [userId]);
                if (user && user.phone) {
                    await sendMessageToTarget(user.phone);
                }
            }
            return sentCount;
        } catch (error) {
            console.error('Error sending message:', error);
            return 0;
        }
    }

    static async sendPrayerReminder(config, prayerName, prayerTime, setting) {
        try {
            const prayerNames = { fajr: 'الفجر', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };
            const prayerNameAr = prayerNames[prayerName];

            // Convert 24h to 12h format
            const [hoursStr, minutesStr] = prayerTime.split(':');
            let hours = parseInt(hoursStr);
            const period = hours >= 12 ? 'م' : 'ص';
            hours = hours % 12 || 12; // Convert 0 to 12
            const time12 = `${hours}:${minutesStr} ${period}`;

            let message = `🕌 تذكير بصلاة ${prayerNameAr}\n⏰ الوقت: ${time12}\n\n`;
            if (setting.reminder_before_minutes > 0) message += `⏳ باقي ${setting.reminder_before_minutes} دقيقة على الأذان\n\n`;
            message += 'حَيَّ عَلَى الصَّلَاةِ 🤲';

            await this.sendWhatsAppMessage(config.session_id, config.user_id, message, config.id);
        } catch (error) {
            console.error('Error sending prayer reminder:', error);
        }
    }
}

module.exports = SchedulerService;
