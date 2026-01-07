const { db } = require('../database/db');
const messageService = require('./baileys/MessageService');
const sessionManager = require('./baileys/SessionManager');
const NotificationService = require('./NotificationService');

class PaymentService {

    /**
     * Create a new payment request
     */
    async createPaymentRequest(userId, planId, amount, method, transactionRef, receiptPath) {
        try {
            // 1. Get or create pending subscription
            let subscription = await db.get(
                'SELECT * FROM subscriptions WHERE user_id = ? AND status = ?',
                [userId, 'pending']
            );

            if (!subscription) {
                // Create new pending subscription
                const subResult = await db.run(`
                    INSERT INTO subscriptions (user_id, plan_id, status, start_date)
                    VALUES (?, ?, 'pending', ?)
                `, [userId, planId, new Date().toISOString()]);
                subscription = { id: subResult.id, user_id: userId, plan_id: planId, status: 'pending' };
            }

            // 2. Create payment record linked to subscription
            const result = await db.run(`
                INSERT INTO payments (user_id, subscription_id, amount, method, transaction_ref, receipt_path, status)
                VALUES (?, ?, ?, ?, ?, ?, 'pending')
            `, [userId, subscription.id, amount, method, transactionRef, receiptPath]);

            const paymentId = result.id;
            console.log(`[PaymentService] Payment created: ID=${paymentId}, Subscription=${subscription.id}`);

            // 3. Notify Admin (async, fire-and-forget)
            this.notifyAdminWithReceipt(paymentId, userId, planId, amount, method, transactionRef, receiptPath)
                .catch(e => console.error('[PaymentService] Notification error:', e));

            return paymentId;

        } catch (error) {
            console.error('[PaymentService] Error creating payment:', error);
            throw new Error('Failed to create payment request');
        }
    }

    /**
     * Notify Admin about new payment with receipt image and details
     */
    async notifyAdminWithReceipt(paymentId, userId, planId, amount, method, transactionRef, receiptPath) {
        try {
            console.log(`[PaymentService] Notifying admin about payment ${paymentId}`);
            
            const adminSessionId = await NotificationService.getAdminSession();
            if (!adminSessionId) {
                console.warn('[PaymentService] No active admin session. Payment notification skipped.');
                return false;
            }

            // Fetch user details
            const user = await db.get('SELECT name, phone FROM users WHERE id = ?', [userId]);
            if (!user) return false;

            // Fetch plan details
            const plan = await db.get('SELECT name, duration_days FROM plans WHERE id = ?', [planId]);
            if (!plan) return false;

            // Format message for admin
            const message = `💰 *طلب دفع جديد - رقم: ${paymentId}*

👤 *المستخدم:* ${user.name}
📱 *الهاتف:* ${user.phone}

📋 *تفاصيل الباقة:*
🏷️ الخطة: ${plan.name}
⏱️ المدة: ${plan.duration_days} يوم
💸 المبلغ: ${amount} ج.م

💳 *طريقة الدفع:* ${method}
#️⃣ *رقم المرجع:* ${transactionRef || 'بدون'}

⏳ الحالة: في انتظار التأكيد`;

            // Send text message to admin
            await messageService.sendMessage(adminSessionId, user.phone, message);
            console.log(`✅ [PaymentService] Payment notification sent to admin`);
            return true;

        } catch (error) {
            console.error('[PaymentService] Error notifying admin:', error.message);
            return false;
        }
    }
}

module.exports = new PaymentService();
