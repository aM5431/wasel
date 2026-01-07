const bcrypt = require('bcrypt');
const { db } = require('../database/db');

// Helper to generate UUID
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

class AuthService {
    static async register(userData) {
        const { name, phone, email, password, planId } = userData;

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
        const user = await db.get('SELECT * FROM users WHERE phone = ? OR email = ?', [identifier, identifier]);
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
