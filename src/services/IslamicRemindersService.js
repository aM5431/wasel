const { db } = require('../database/db');
const { v4: uuidv4 } = require('uuid');

class IslamicRemindersService {
    /**
     * Create or get Islamic Reminders configuration for a user
     */
    static async getOrCreateConfig(userId) {
        let config = await db.get(
            'SELECT * FROM islamic_reminders_config WHERE user_id = ?',
            [userId]
        );

        if (!config) {
            const configId = 'conf-' + Math.random().toString(36).substr(2, 9);
            await db.run(
                'INSERT INTO islamic_reminders_config (id, user_id) VALUES (?, ?)',
                [configId, userId]
            );

            // Initialize Prayer Settings
            const prayers = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
            for (const prayer of prayers) {
                const settingId = 'pray-' + Math.random().toString(36).substr(2, 9);
                await db.run(
                    'INSERT INTO prayer_settings (id, config_id, prayer_name) VALUES (?, ?, ?)',
                    [settingId, configId, prayer]
                );
            }

            // Initialize Fasting Settings
            const fastingId = 'fast-' + Math.random().toString(36).substr(2, 9);
            await db.run(
                'INSERT INTO fasting_settings (id, config_id) VALUES (?, ?)',
                [fastingId, configId]
            );

            // Initialize Adhkar Settings (CRITICAL FIX)
            const adhkarId = 'adhkar-' + Math.random().toString(36).substr(2, 9);
            await db.run(
                'INSERT INTO adhkar_settings (id, config_id) VALUES (?, ?)',
                [adhkarId, configId]
            );

            config = await db.get('SELECT * FROM islamic_reminders_config WHERE user_id = ?', [userId]);
        } else {
            // Ensure Adhkar settings exist for EXISTING configs too (Migration fix)
            const checkAdhkar = await db.get('SELECT id FROM adhkar_settings WHERE config_id = ?', [config.id]);
            if (!checkAdhkar) {
                const adhkarId = 'adhkar-' + Math.random().toString(36).substr(2, 9);
                await db.run(
                    'INSERT INTO adhkar_settings (id, config_id) VALUES (?, ?)',
                    [adhkarId, config.id]
                );
            }
        }

        return config;
    }

    /**
     * Update location settings
     */
    static async updateLocation(configId, locationData) {
        const { country, city, latitude, longitude, timezone, prayer_calculation_method } = locationData;

        await db.run(
            `UPDATE islamic_reminders_config 
             SET location_country = ?, location_city = ?, latitude = ?, longitude = ?, timezone = ?, prayer_calculation_method = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [country, city, latitude, longitude, timezone, prayer_calculation_method, configId]
        );

        return await db.get('SELECT * FROM islamic_reminders_config WHERE id = ?', [configId]);
    }

    /**
     * Update general settings
     */
    static async updateGeneralSettings(configId, hijriAdjustment, fridayKahf) {
        try {
            await db.run(
                'UPDATE islamic_reminders_config SET hijri_adjustment = ?, friday_kahf = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [hijriAdjustment, fridayKahf ? 1 : 0, configId]
            );
            return await db.get('SELECT * FROM islamic_reminders_config WHERE id = ?', [configId]);
        } catch (error) {
            console.error('Error updating general settings:', error);
            throw error;
        }
    }

    /**
     * Link WhatsApp session
     */
    static async linkSession(configId, sessionId) {
        await db.run(
            `UPDATE islamic_reminders_config SET session_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [sessionId, configId]
        );
    }

    /**
     * Get prayer settings
     */
    static async getPrayerSettings(configId) {
        return await db.all(
            'SELECT * FROM prayer_settings WHERE config_id = ? ORDER BY CASE prayer_name WHEN "fajr" THEN 1 WHEN "dhuhr" THEN 2 WHEN "asr" THEN 3 WHEN "maghrib" THEN 4 WHEN "isha" THEN 5 END',
            [configId]
        );
    }

    /**
     * Update prayer setting
     */
    static async updatePrayerSetting(prayerId, settings) {
        const fields = [];
        const values = [];

        const allowedFields = ['enabled', 'reminder_before_minutes', 'send_adhan', 'send_after_reminder', 'adhan_sound'];

        for (const [key, value] of Object.entries(settings)) {
            if (allowedFields.includes(key)) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        }

        if (fields.length === 0) return;

        values.push(prayerId);
        await db.run(
            `UPDATE prayer_settings SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
    }

    /**
     * Get fasting settings
     */
    static async getFastingSettings(configId) {
        return await db.get(
            'SELECT * FROM fasting_settings WHERE config_id = ?',
            [configId]
        );
    }

    /**
     * Update fasting settings
     */
    static async updateFastingSettings(configId, settings) {
        const fields = [];
        const values = [];

        // Map frontend keys to database columns if needed, or use direct mapping
        // Added reminder_time
        const allowedFields = ['monday', 'thursday', 'monday_thursday', 'white_days', 'ashura', 'dhul_hijjah_first_10', 'ramadan_alerts', 'reminder_time'];

        for (const [key, value] of Object.entries(settings)) {
            if (allowedFields.includes(key)) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        }

        if (fields.length === 0) return;

        values.push(configId);
        await db.run(
            `UPDATE fasting_settings SET ${fields.join(', ')} WHERE config_id = ?`,
            values
        );
    }

    /**
     * Get adhkar settings
     */
    static async getAdhkarSettings(configId) {
        return await db.get(
            'SELECT * FROM adhkar_settings WHERE config_id = ?',
            [configId]
        );
    }

    /**
     * Update adhkar settings
     */
    static async updateAdhkarSettings(configId, settings) {
        const fields = [];
        const values = [];

        const allowedFields = ['morning_enabled', 'morning_time', 'morning_source', 'evening_enabled', 'evening_time', 'evening_source', 'hadith_enabled', 'hadith_time', 'hadith_source', 'media_preference', 'content_enabled', 'content_time', 'content_type', 'text_length', 'frequency', 'parts_per_day', 'randomize_schedule'];

        for (const [key, value] of Object.entries(settings)) {
            if (allowedFields.includes(key)) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        }

        if (fields.length === 0) return;

        values.push(configId);
        await db.run(
            `UPDATE adhkar_settings SET ${fields.join(', ')} WHERE config_id = ?`,
            values
        );
    }

    /**
     * Add recipient (individual or group)
     */
    static async addRecipient(configId, recipientData) {
        const { type, whatsapp_id, name } = recipientData;

        await db.run(
            `INSERT INTO reminder_recipients (id, config_id, type, whatsapp_id, name) VALUES (?, ?, ?, ?, ?)`,
            [uuidv4(), configId, type, whatsapp_id, name]
        );
    }

    /**
     * Get all recipients
     */
    static async getRecipients(configId) {
        return await db.all(
            'SELECT * FROM reminder_recipients WHERE config_id = ?',
            [configId]
        );
    }

    /**
     * Toggle recipient status
     */
    static async toggleRecipient(recipientId, enabled) {
        await db.run(
            'UPDATE reminder_recipients SET enabled = ? WHERE id = ?',
            [enabled, recipientId]
        );
    }

    /**
     * Delete recipient
     */
    static async deleteRecipient(recipientId) {
        await db.run(
            'DELETE FROM reminder_recipients WHERE id = ?',
            [recipientId]
        );
    }
}

module.exports = IslamicRemindersService;
