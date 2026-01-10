const bcrypt = require('bcrypt');
const { db } = require('../database/db');
const NotificationService = require('./NotificationService');

// Helper to generate UUID
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

class AuthService {
    /**
     * Normalizes phone numbers to international format (e.g., +2010... -> 2010...)
     * Specifically handles Egyptian numbers starting with 0.
     */
    static normalizePhone(phone) {
        if (!phone) return phone;
        // Remove all non-digit characters
        let cleaned = phone.replace(/\D/g, '');

        // 1. Remove leading 00 if present (international prefix)
        if (cleaned.startsWith('00')) {
            cleaned = cleaned.substring(2);
        }

        // 2. Handle Egyptian specifics
        // If it starts with 200... (result of +20 + 010...) and is 12 or 13 digits
        if (cleaned.startsWith('200') && (cleaned.length === 12 || cleaned.length === 13)) {
            cleaned = '20' + cleaned.substring(3);
        }

        // If it starts with 0... and is 11 digits (local Egyptian)
        if (cleaned.startsWith('0') && cleaned.length === 11) {
            cleaned = '20' + cleaned.substring(1);
        }

        // If it starts with 10, 11, 12, 15 and is 10 digits (no leading 0 or 20)
        const egPrefixes = ['10', '11', '12', '15'];
        if (cleaned.length === 10 && egPrefixes.some(p => cleaned.startsWith(p))) {
            cleaned = '20' + cleaned;
        }

        return cleaned;
    }

    static async register(userData) {
        let { name, phone, email, password, planId } = userData;
        phone = this.normalizePhone(phone);

        // 1. Check if user exists
        const existing = await db.get('SELECT id FROM users WHERE phone = ? OR email = ?', [phone, email]);
        if (existing) {
            throw new Error('رقم الهاتف أو البريد الإلكتروني مسجل بالفعل');
        }

        // 2. Hash Password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const userId = generateUUID();

        // 3. Get Plan details
        const plan = await db.get('SELECT * FROM plans WHERE id = ?', [planId]);
        if (!plan) throw new Error('الباقة غير موجودة');

        let subStatus = 'pending';
        let startDate = null;
        let endDate = null;

        if (plan.is_trial) {
            subStatus = 'active';
            startDate = new Date().toISOString();
            const end = new Date();
            end.setDate(end.getDate() + plan.duration_days);
            endDate = end.toISOString();
        }

        // 4. Create User & Subscription (Sequential since no transaction support in custom wrapper yet)
        await db.run('INSERT INTO users (id, name, phone, email, password_hash) VALUES (?, ?, ?, ?, ?)',
            [userId, name, phone, email, hashedPassword]);

        await db.run(`
            INSERT INTO subscriptions (user_id, plan_id, status, start_date, end_date) 
            VALUES (?, ?, ?, ?, ?)`,
            [userId, plan.id, subStatus, startDate, endDate]);

        await NotificationService.createAdminNotification(
            'مستخدم جديد 👤',
            `قام ${name} بالتسجيل في المنصة (باقة ${plan.name})`,
            'info'
        );

        return {
            userId,
            status: subStatus,
            plan,
            subscription: {
                startDate,
                endDate
            }
        };
    }

    static async login(identifier, password) {
        // If identifier looks like a phone number (mostly digits), normalize it
        const normalizedIdentifier = identifier.includes('@') ? identifier : this.normalizePhone(identifier);

        const user = await db.get('SELECT * FROM users WHERE phone = ? OR email = ?', [normalizedIdentifier, identifier]);

        if (!user) {
            throw new Error('بيانات الدخول غير صحيحة');
        }

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            throw new Error('بيانات الدخول غير صحيحة');
        }

        return user;
    }
}

module.exports = AuthService;
