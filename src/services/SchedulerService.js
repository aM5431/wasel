const cron = require('node-cron');
const moment = require('moment-timezone');
const crypto = require('crypto');
const IslamicRemindersService = require('./IslamicRemindersService');
const PrayerTimesService = require('./PrayerTimesService');
const FastingService = require('./FastingService');
const MessageService = require('./baileys/MessageService');
const { db } = require('../database/db');

class SchedulerService {
    static prayerJobs = new Map();

    static init() {
        console.log('Starting Scheduler Service...');
        // Every minute tasks (Reminders)
        cron.schedule('* * * * *', async () => {
            await this.runScheduledTasks();
        });

        // Daily tasks (at midnight)
        cron.schedule('0 0 * * *', async () => {
            await this.checkSubscriptionExpirations();
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
                       a.hadith_enabled, a.hadith_time, a.hadith_source, a.hadith_times_count, a.hadith_times_json,
                       a.selected_enabled, a.selected_category, a.selected_media_mode, a.selected_show_source_text, a.selected_show_link, a.selected_image_theme, a.selected_times_count, a.selected_times_json,
                       a.media_preference,
                       a.content_enabled, a.content_time, a.content_type,
                       a.morning_show_link, a.evening_show_link, a.hadith_show_link, a.content_show_link,
                       a.hadith_media_mode, a.hadith_show_source_text, a.hadith_show_image_source_text, a.hadith_image_source, a.hadith_image_theme,
                       a.quran_enabled, a.quran_time, a.quran_pages_per_day,
                       a.text_length, a.before_after_prayer, a.show_source_link
                FROM islamic_reminders_config c
                LEFT JOIN fasting_settings f ON f.config_id = c.id
                LEFT JOIN adhkar_settings a ON a.config_id = c.id
                WHERE c.session_id IS NOT NULL
            `);

            console.log(`[Scheduler] Found ${configs.length} active configs`);
            if (configs.length === 0) return;

            for (const config of configs) {
                if (!config.session_id) {
                    console.log(`[Scheduler] Skipping config ${config.id} - No session linked`);
                    continue;
                }

                // Check if session is connected
                const SessionManager = require('./baileys/SessionManager');
                const session = SessionManager.getSession(config.session_id);
                if (!session || !session.user) {
                    console.log(`[Scheduler] Skipping config ${config.id} - Session ${config.session_id} disconnected`);
                    continue;
                }
                const timezone = config.timezone || 'Africa/Cairo';
                const now = moment().tz(timezone);
                const currentTime = now.format('HH:mm');

                if (now.second() === 0) {
                    console.log(`[Scheduler-TimeCheck] Config: ${config.id}, TZ: ${timezone}, Time: ${currentTime}`);
                }

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
                    await this.sendUserContentReminder(config, 'adhkar', 'morning', config.morning_source, { showLink: config.morning_show_link });
                }

                // 5. Evening Adhkar
                const eveningTime = config.evening_time || '17:00';
                if (config.evening_enabled !== 0 && currentTime === eveningTime) {
                    await this.sendUserContentReminder(config, 'adhkar', 'evening', config.evening_source, { showLink: config.evening_show_link });
                }

                // 6. Daily Hadith (1..5 times)
                if (config.hadith_enabled !== 0) {
                    const scheduleDate = now.format('YYYY-MM-DD');
                    const hadithTimes = this.getHadithTimes(config);
                    for (const t of hadithTimes) {
                        if (currentTime === t) {
                            await this.sendUserContentReminder(config, 'hadith', 'general', config.hadith_source, { showLink: config.hadith_show_link, scheduleTime: t, scheduleDate });
                        }
                    }
                }

                // 6.5 Selected Adhkar (to self)
                if (config.selected_enabled !== 0) {
                    const scheduleDate = now.format('YYYY-MM-DD');
                    const times = this.getSelectedAdhkarTimes(config);
                    for (const t of times) {
                        if (currentTime === t) {
                            await this.sendSelectedAdhkarToSelf(config, now, { scheduleTime: t, scheduleDate });
                        }
                    }
                }

                // 7. Daily Content (Image/Video)
                const contentTime = config.content_time || '21:00';
                if (config.content_enabled !== 0 && currentTime === contentTime) {
                    await this.sendUserContentReminder(config, 'content', 'general', 'auto', { showLink: config.content_show_link });
                }

                // 8. Quran Reminders
                const quranTime = config.quran_time || '09:00';
                if (config.quran_enabled !== 0 && currentTime === quranTime) {
                    await this.sendUserContentReminder(config, 'quran_part', 'general', 'auto');
                }

                await this.checkCustomScheduleJobs(config, now);
            }
        } catch (error) {
            console.error('Error in runScheduledTasks:', error);
        }
    }

    static getHadithTimes(config) {
        const fallback = String(config.hadith_time || '12:00');
        let times = [];
        const raw = config.hadith_times_json;
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    times = parsed.map(t => String(t || '').trim()).filter(Boolean);
                }
            } catch (e) { }
        }

        const countRaw = Number(config.hadith_times_count || times.length || 1);
        const count = Math.min(5, Math.max(1, Number.isFinite(countRaw) ? countRaw : 1));

        const isTime = (t) => /^\d{2}:\d{2}$/.test(t);
        const addMinutes = (t, minutesToAdd) => {
            const [h, m] = t.split(':').map(x => parseInt(x, 10));
            if (!Number.isFinite(h) || !Number.isFinite(m)) return fallback;
            const total = (h * 60 + m + minutesToAdd) % (24 * 60);
            const hh = String(Math.floor(total / 60)).padStart(2, '0');
            const mm = String(total % 60).padStart(2, '0');
            return `${hh}:${mm}`;
        };

        if (!times.length) times = [fallback];
        times = times.filter(isTime);
        if (!times.length) times = [fallback];
        times = times.slice(0, count);

        while (times.length < count) {
            const prev = times[times.length - 1] || fallback;
            times.push(addMinutes(prev, 180));
        }

        const used = new Set();
        const unique = [];
        for (const t of times) {
            let tt = t;
            for (let i = 0; i < 90 && used.has(tt); i++) {
                tt = addMinutes(tt, 1);
            }
            used.add(tt);
            unique.push(tt);
        }

        return unique.slice(0, count);
    }

    static getSelectedAdhkarTimes(config) {
        const fallback = '12:00';
        let times = [];
        const raw = config.selected_times_json;
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    times = parsed.map(t => String(t || '').trim()).filter(Boolean);
                }
            } catch (e) { }
        }

        const countRaw = Number(config.selected_times_count || times.length || 1);
        const count = Math.min(5, Math.max(1, Number.isFinite(countRaw) ? countRaw : 1));

        const isTime = (t) => /^\d{2}:\d{2}$/.test(t);
        const addMinutes = (t, minutesToAdd) => {
            const [h, m] = t.split(':').map(x => parseInt(x, 10));
            if (!Number.isFinite(h) || !Number.isFinite(m)) return fallback;
            const total = (h * 60 + m + minutesToAdd) % (24 * 60);
            const hh = String(Math.floor(total / 60)).padStart(2, '0');
            const mm = String(total % 60).padStart(2, '0');
            return `${hh}:${mm}`;
        };

        if (!times.length) times = [fallback];
        times = times.filter(isTime);
        if (!times.length) times = [fallback];
        times = times.slice(0, count);

        while (times.length < count) {
            const prev = times[times.length - 1] || fallback;
            times.push(addMinutes(prev, 180));
        }

        const used = new Set();
        const unique = [];
        for (const t of times) {
            let tt = t;
            for (let i = 0; i < 90 && used.has(tt); i++) {
                tt = addMinutes(tt, 1);
            }
            used.add(tt);
            unique.push(tt);
        }

        return unique.slice(0, count);
    }

    static async sendSelectedAdhkarToSelf(config, now, options = {}) {
        try {
            const scheduleTime = options.scheduleTime ? String(options.scheduleTime) : null;
            const scheduleDate = options.scheduleDate ? String(options.scheduleDate) : null;
            if (!scheduleTime || !scheduleDate) return;

            const already = await db.get(
                'SELECT id FROM selected_adhkar_schedule_log WHERE config_id = ? AND date = ? AND send_time = ?',
                [config.id, scheduleDate, scheduleTime]
            );
            if (already) return;

            const userRow = await db.get('SELECT phone FROM users WHERE id = ?', [config.user_id]);
            const phone = userRow?.phone;
            if (!phone) return;

            const AdhkarService = require('./AdhkarService');
            const IslamicBackgroundService = require('./IslamicBackgroundService');

            const category = String(config.selected_category || 'general');
            const item = await AdhkarService.getRandomAdhkar(category);
            if (!item || !item.text) return;

            const includeSource = Number(config.selected_show_source_text) !== 0;
            const includeLink = Number(config.selected_show_link) !== 0;
            const mode = String(config.selected_media_mode || 'text');

            let message = String(item.text).trim();
            if (includeSource && item.source) message += `\n\n📚 المصدر: ${item.source}`;
            if (includeLink && item.source_url) message += `\n🔗 للمزيد: ${item.source_url}`;

            let mediaUrl = null;
            if (mode === 'image') {
                const img = await IslamicBackgroundService.getBackground({ theme: config.selected_image_theme || 'mosques' });
                mediaUrl = img?.url || null;
            }

            if (mediaUrl) {
                MessageService.addToQueue(config.session_id, phone, message, 'media', { mediaUrl, mediaType: 'image' });
            } else {
                MessageService.addToQueue(config.session_id, phone, message, 'text');
            }

            const contentHash = crypto.createHash('sha1').update(String(item.text || '')).digest('hex');
            await db.run(
                'INSERT OR IGNORE INTO selected_adhkar_schedule_log (config_id, date, send_time, content_hash, image_url) VALUES (?, ?, ?, ?, ?)',
                [config.id, scheduleDate, scheduleTime, contentHash, mediaUrl]
            );
        } catch (error) {
            console.error(`Error in sendSelectedAdhkarToSelf for config ${config.id}:`, error);
        }
    }

    static async checkCustomScheduleJobs(config, now) {
        try {
            const currentDate = now.format('YYYY-MM-DD');
            const currentTime = now.format('HH:mm');
            const day = now.day();

            const jobs = await db.all(
                'SELECT * FROM custom_schedule_jobs WHERE config_id = ? AND enabled = 1',
                [config.id]
            );
            if (!jobs || !jobs.length) return;

            const userRow = await db.get('SELECT phone FROM users WHERE id = ?', [config.user_id]);
            const phone = userRow?.phone;
            if (!phone) return;

            const shouldRun = (schedule) => {
                const type = String(schedule?.type || 'weekly');
                const time = schedule?.time ? String(schedule.time) : null;
                const times = Array.isArray(schedule?.times) ? schedule.times.map(String) : (time ? [time] : []);
                if (!times.includes(currentTime)) return false;

                if (type === 'date' || type === 'dates') {
                    const single = schedule?.date ? [String(schedule.date)] : [];
                    const dates = Array.isArray(schedule?.dates) ? schedule.dates.map(String) : single;
                    return dates.includes(currentDate);
                }

                const singleDay = (schedule?.day !== undefined && schedule?.day !== null) ? [Number(schedule.day)] : [];
                const days = Array.isArray(schedule?.days) ? schedule.days.map(Number) : singleDay;
                if (!days.length) return true;
                return days.includes(day);
            };

            for (const job of jobs) {
                let payload = {};
                let schedule = {};
                try { payload = JSON.parse(job.payload_json || '{}') || {}; } catch (e) { payload = {}; }
                try { schedule = JSON.parse(job.schedule_json || '{}') || {}; } catch (e) { schedule = {}; }

                if (!shouldRun(schedule)) continue;

                const inserted = await db.run(
                    'INSERT OR IGNORE INTO custom_schedule_log (job_id, config_id, date, send_time) VALUES (?, ?, ?, ?)',
                    [job.id, config.id, currentDate, currentTime]
                );
                const didInsert = inserted && typeof inserted.changes === 'number' ? inserted.changes > 0 : true;
                if (!didInsert) continue;

                const text = String(payload.text || '').trim();
                const mediaUrl = payload.mediaUrl ? String(payload.mediaUrl).trim() : '';
                const mediaType = payload.mediaType ? String(payload.mediaType).trim() : '';

                if (mediaUrl && ['image', 'video', 'audio'].includes(mediaType)) {
                    MessageService.addToQueue(config.session_id, phone, text, 'media', {
                        mediaUrl,
                        mediaType
                    });
                } else if (text || mediaUrl) {
                    const msg = mediaUrl ? `${text}\n${mediaUrl}`.trim() : text;
                    if (msg) MessageService.addToQueue(config.session_id, phone, msg, 'text');
                }
            }
        } catch (error) {
            console.error(`Error in checkCustomScheduleJobs for config ${config.id}:`, error);
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
                const prayerTime = times[setting.prayer_name.toLowerCase()]; // Ensure lowercase key match
                if (!prayerTime) continue;

                const [hours, minutes] = prayerTime.split(':').map(Number);
                const prayerMinutes = hours * 60 + minutes;
                
                // 1. Before Prayer Reminder
                if (setting.enabled) {
                    const reminderMinutes = prayerMinutes - (setting.reminder_before_minutes || 0);
                    const normalizedReminderMinutes = (reminderMinutes + 24 * 60) % (24 * 60);
                    const reminderTime = `${String(Math.floor(normalizedReminderMinutes / 60)).padStart(2, '0')}:${String(normalizedReminderMinutes % 60).padStart(2, '0')}`;

                    console.log(`[Scheduler-Debug] Prayer: ${setting.prayer_name}, PrayerTime: ${prayerTime}, ReminderTime: ${reminderTime}, CurrentTime: ${currentTime}`);

                    if (currentTime === reminderTime) {
                        console.log(`[Scheduler] Sending prayer reminder for ${setting.prayer_name} at ${currentTime} (Time: ${prayerTime})`);
                        await this.sendPrayerReminder(config, setting.prayer_name, prayerTime, setting);
                    }
                }

                // 2. Post-Prayer Adhkar (Per-prayer setting)
                if (setting.post_prayer_adhkar_enabled !== 0) {
                    const afterMinutes = prayerMinutes + (setting.post_prayer_adhkar_delay || 5);
                    const normalizedAfterMinutes = (afterMinutes + 24 * 60) % (24 * 60);
                    const afterTime = `${String(Math.floor(normalizedAfterMinutes / 60)).padStart(2, '0')}:${String(normalizedAfterMinutes % 60).padStart(2, '0')}`;

                    console.log(`[Scheduler-Debug] Post-Prayer: ${setting.prayer_name}, PrayerTime: ${prayerTime}, AfterTime: ${afterTime}, CurrentTime: ${currentTime}`);

                    if (currentTime === afterTime) {
                        console.log(`[Scheduler] Sending Post-Prayer Adhkar for ${setting.prayer_name} at ${currentTime} (Delay: ${setting.post_prayer_adhkar_delay || 5}m)`);
                        await this.sendUserContentReminder(config, 'adhkar', 'after_prayer', 'manual', { showLink: setting.post_prayer_adhkar_show_link });
                    }
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
            } else if (status.isAshura && settings.ashura) {
                shouldRemind = true;
                message = FastingService.getReminderMessage('ashura');
            } else if (status.isArafah && settings.dhul_hijjah_first_10) {
                shouldRemind = true;
                message = FastingService.getReminderMessage('arafah');
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

    static async sendUserContentReminder(config, type, category, sourcePreference = 'mixed', options = {}) {
        try {
            const ContentService = require('./ContentService');
            const ExternalContentService = require('./ExternalContentService');
            const HadithService = require('./HadithService');

            let content = null;
            let isLocal = false;
            const scheduleTime = options.scheduleTime ? String(options.scheduleTime) : null;
            const scheduleDate = options.scheduleDate ? String(options.scheduleDate) : null;
            const usedHadithIds = new Set();
            const usedHadithHashes = new Set();
            const usedImageUrls = new Set();
            const normalizeText = (t) => String(t || '').replace(/\s+/g, ' ').trim();
            const hashText = (t) => {
                const s = normalizeText(t);
                if (!s) return '';
                return crypto.createHash('sha1').update(s).digest('hex');
            };

            if (type === 'hadith' && scheduleTime && scheduleDate) {
                try {
                    const already = await db.get(
                        'SELECT id FROM hadith_schedule_log WHERE config_id = ? AND date = ? AND send_time = ?',
                        [config.id, scheduleDate, scheduleTime]
                    );
                    if (already) return;

                    const rows = await db.all(
                        'SELECT hadith_id, hadith_hash, image_url FROM hadith_schedule_log WHERE config_id = ? AND date = ?',
                        [config.id, scheduleDate]
                    );
                    for (const r of rows || []) {
                        if (r?.hadith_id) usedHadithIds.add(String(r.hadith_id));
                        if (r?.hadith_hash) usedHadithHashes.add(String(r.hadith_hash));
                        if (r?.image_url) usedImageUrls.add(String(r.image_url));
                    }
                } catch (e) { }
            }

            // STRICT RULES ENFORCEMENT
            // ------------------------
            // 1. Adhkar (Morning/Evening/After Prayer) -> FORCE TEXT ONLY
            if (type === 'adhkar' && (category === 'morning' || category === 'evening' || category === 'after_prayer')) {
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
                // For now, let's send configured number of pages (default 3)
                const pagesToSend = juzData.images.slice(0, config.quran_pages_per_day || 3);
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

            const useLocalHadith = (type === 'hadith' && ['bukhari', 'muslim', 'mixed', 'manual'].includes(String(sourcePreference || 'mixed')));
            if (sourcePreference === 'manual' || sourcePreference === 'mixed' || forceFullText || useLocalHadith) {
                if (type === 'adhkar') {
                    console.log(`[Scheduler-Adhkar] Fetching manual adhkar for ${category} (ForceFull: ${forceFullText})`);
                    // Fetch adhkar for morning/evening
                    let allContent = await ContentService.getAllContent(type, category);
                    console.log(`[Scheduler-Adhkar] Found ${allContent ? allContent.length : 0} items in library`);

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
                            let headerTitle = '';
                            if (category === 'morning') headerTitle = '🌅 أذكار الصباح كاملة';
                            else if (category === 'evening') headerTitle = '🌙 أذكار المساء كاملة';
                            else if (category === 'after_prayer') headerTitle = '📿 أذكار بعد الصلاة';
                            
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
                    if (type === 'hadith') {
                        const book = (sourcePreference === 'bukhari' || sourcePreference === 'muslim') ? sourcePreference : null;
                        const maxTries = (scheduleTime && scheduleDate) ? 30 : 1;
                        for (let i = 0; i < maxTries; i++) {
                            const row = await HadithService.getRandomHadith(book);
                            if (!row) break;

                            const h = hashText(row.content_ar || row.content);
                            if (scheduleTime && scheduleDate) {
                                if (row.id && usedHadithIds.has(String(row.id))) continue;
                                if (h && usedHadithHashes.has(String(h))) continue;
                            }

                            content = row;
                            isLocal = true;
                            break;
                        }
                    } else {
                        content = await ContentService.getRandomContent(type, category);
                        if (content) isLocal = true;
                    }
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
                if (type === 'hadith' && scheduleTime && scheduleDate) {
                    for (let i = 0; i < 10; i++) {
                        const external = await ExternalContentService.getDailyContent(config.media_preference || 'mixed', type, category);
                        if (!external) continue;
                        const h = hashText(external.content_ar || external.content);
                        if (h && usedHadithHashes.has(String(h))) continue;
                        content = external;
                        isLocal = false;
                        break;
                    }
                } else {
                    const external = await ExternalContentService.getDailyContent(config.media_preference || 'mixed', type, category);
                    if (external) {
                        content = external;
                        isLocal = false;
                    }
                }
            }

            if (!content) return;

            let message = `${content.content_ar || content.content}\n\n`;
            if (content.source) {
                let showSourceTextSetting = 1;
                if (type === 'hadith' && config.hadith_show_source_text !== undefined && config.hadith_show_source_text !== null) {
                    showSourceTextSetting = config.hadith_show_source_text;
                }
                if (Number(showSourceTextSetting) === 1) {
                    message += `📚 المصدر: ${content.source}`;
                }
            }

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
                    // Generate Dorar.net search link - USE CLEANED SNIPPET (No Sanad)
                    const text = content.content_ar || content.content;
                    // Extract core text after "قال رسول الله ﷺ: " if present, or just use first 100 chars
                    const coreText = text.includes('قال رسول الله ﷺ:') ? text.split('قال رسول الله ﷺ:')[1] : text;
                    const snippet = coreText.substring(0, 100).replace(/[^\u0621-\u064A\s]/g, '').trim();
                    sourceLink = `https://dorar.net/hadith/search?q=${encodeURIComponent(snippet)}`;
                }
            }

            console.log(`[Scheduler-Adhkar] Show source link setting: ${config.show_source_link} (Type: ${typeof config.show_source_link})`);
            
            // Determine if we should show link
            // If options.showLink is provided (0 or 1), use it. Otherwise use config global setting.
            let showLinkSetting = config.show_source_link;
            if (options.showLink !== undefined) {
                showLinkSetting = options.showLink;
            }

            if (sourceLink && Number(showLinkSetting) === 1) {
                message += `\n🔗 للمزيد: ${sourceLink}`;
            }

            const sendOptions = {};
            let pickedImageUrlForLog = null;
            if (content.media_url) {
                sendOptions.mediaUrl = content.media_url;
                sendOptions.mediaType = content.media_type || 'image';
                if (typeof content.media_url === 'string') {
                    pickedImageUrlForLog = content.media_url;
                }
            }

            if (type === 'hadith' && (config.hadith_media_mode === 'image' || config.hadith_media_mode === 'both')) {
                const QuranService = require('./QuranService');
                const IslamicBackgroundService = require('./IslamicBackgroundService');
                const RemoteMediaService = require('./RemoteMediaService');

                const imageSource = config.hadith_image_source || 'quran_pages';
                if (imageSource === 'islamic_backgrounds') {
                    const img = await IslamicBackgroundService.getBackground({ theme: config.hadith_image_theme || 'mixed', excludeUrls: Array.from(usedImageUrls) });
                    const pickedUrl = img?.url || null;
                    pickedImageUrlForLog = pickedUrl;
                    const buffer = pickedUrl ? await RemoteMediaService.fetchImageBuffer(pickedUrl) : null;
                    if (buffer) {
                        sendOptions.mediaUrl = buffer;
                    } else if (pickedUrl) {
                        sendOptions.mediaUrl = pickedUrl;
                    }
                    sendOptions.mediaType = 'image';
                } else {
                    const url = QuranService.getRandomPageImage();
                    pickedImageUrlForLog = url;
                    const buffer = await RemoteMediaService.fetchImageBuffer(url);
                    sendOptions.mediaUrl = buffer || url;
                    sendOptions.mediaType = 'image';
                }

                const showImgSource = (config.hadith_show_image_source_text !== undefined && config.hadith_show_image_source_text !== null)
                    ? Number(config.hadith_show_image_source_text) === 1
                    : true;
                if (showImgSource) {
                    message += imageSource === 'islamic_backgrounds'
                        ? `\n🖼️ مصدر الصورة: صور مساجد احترافية`
                        : `\n🖼️ مصدر الصورة: صفحات القرآن (مصحف المدينة)`;
                }
            }

            const sentCount = await this.sendWhatsAppMessage(config.session_id, config.user_id, message, config.id, sendOptions);

            if (type === 'hadith' && scheduleTime && scheduleDate && sentCount > 0) {
                const hadithId = content?.id ? String(content.id) : null;
                const hadithHash = hashText(content.content_ar || content.content) || null;
                try {
                    await db.run(
                        'INSERT OR IGNORE INTO hadith_schedule_log (config_id, date, send_time, hadith_id, hadith_hash, image_url) VALUES (?, ?, ?, ?, ?, ?)',
                        [config.id, scheduleDate, scheduleTime, hadithId, hadithHash, pickedImageUrlForLog]
                    );
                } catch (e) { }
            }

            if (isLocal && sentCount > 0 && content.id) {
                await ContentService.markContentAsSent(content.id);
            }
        } catch (error) {
            console.error(`Error in sendUserContentReminder for config ${config.id}:`, error);
        }
    }

    static async sendWhatsAppMessage(sessionId, userId, text, configId = null, options = {}) {
        try {
            console.log(`[Scheduler-Debug] Attempting to send message. SessionID: ${sessionId}, ConfigID: ${configId}`);
            
            // Check session status via SessionManager first
            const SessionManager = require('./baileys/SessionManager');
            const session = SessionManager.getSession(sessionId);
            
            if (!session || !session.user) {
                console.error(`[Scheduler] Session ${sessionId} not valid or connected. Session exists: ${!!session}, User exists: ${!!(session && session.user)}`);
                return 0;
            }

            // Get config ID fallback
            let targetConfigId = configId;
            if (!targetConfigId) {
                const config = await db.get('SELECT id FROM islamic_reminders_config WHERE session_id = ?', [sessionId]);
                if (!config) {
                    console.error(`[Scheduler] No config found for session ${sessionId}`);
                    return 0;
                }
                targetConfigId = config.id;
            }

            const recipients = await IslamicRemindersService.getRecipients(targetConfigId);
            
            // Filter recipients based on options.targetType
            let filteredRecipients = recipients.filter(r => r.enabled);
            
            if (options.targetType && options.targetType !== 'all') {
                if (options.targetType === 'individuals') {
                    filteredRecipients = filteredRecipients.filter(r => r.type === 'individual');
                } else if (options.targetType === 'groups') {
                    filteredRecipients = filteredRecipients.filter(r => r.type === 'group');
                }
            }

            console.log(`[Scheduler-Debug] Found ${recipients.length} recipients (${filteredRecipients.length} active after filter: ${options.targetType || 'all'}) for config ${targetConfigId}`);

            // We return a "presumed success" count since queue is async
            let plannedCount = 0;

            const enqueueToTarget = async (recipientPhone) => {
                const type = options.mediaUrl ? 'media' : 'text';
                // Using addToQueue for rate limiting and stability
                MessageService.addToQueue(sessionId, recipientPhone, text, type, options);
                plannedCount++;
            };

            if (recipients.length > 0) {
                for (const recipient of filteredRecipients) {
                    if (recipient.whatsapp_id) {
                        await enqueueToTarget(recipient.whatsapp_id);
                    }
                }
            } else {
                // If no recipients configured, send to self (admin)
                // BUT only if we are not strictly filtering for a specific targetType that yielded no results
                // Actually, if recipients exist but filtered to 0, we shouldn't send to admin.
                // If NO recipients exist at all in DB, then maybe send to admin.
                if (recipients.length === 0) {
                    const user = await db.get('SELECT phone FROM users WHERE id = ?', [userId]);
                    if (user && user.phone) {
                        await enqueueToTarget(user.phone);
                    }
                }
            }
            return plannedCount;
        } catch (error) {
            console.error('Error queuing message:', error);
            return 0;
        }
    }

    static async sendPrayerReminder(config, prayerName, prayerTime, setting, targetType = 'all') {
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

            await this.sendWhatsAppMessage(config.session_id, config.user_id, message, config.id, { targetType });
        } catch (error) {
            console.error('Error sending prayer reminder:', error);
        }
    }

    static async checkSubscriptionExpirations() {
        try {
            console.log('[Scheduler] Checking for expired subscriptions...');
            const now = new Date().toISOString();

            // Find active subscriptions that have passed their end_date
            const expiredSubscriptions = await db.all(`
                SELECT id, user_id FROM subscriptions
                WHERE status = 'active' AND end_date < ?
            `, [now]);

            if (expiredSubscriptions.length > 0) {
                console.log(`[Scheduler] Found ${expiredSubscriptions.length} expired subscriptions. Updating...`);
                for (const sub of expiredSubscriptions) {
                    await db.run('UPDATE subscriptions SET status = "expired" WHERE id = ?', [sub.id]);
                }
            }
        } catch (error) {
            console.error('[Scheduler] Error checking expirations:', error);
        }
    }
}

module.exports = SchedulerService;
