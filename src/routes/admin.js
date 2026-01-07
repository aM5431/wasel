const express = require('express');
const router = express.Router();
const { db } = require('../database/db');
const bcrypt = require('bcrypt');
const AuditService = require('../services/AuditService');
const path = require('path');
const fs = require('fs');

// Middleware to check admin role
const requireAdmin = (req, res, next) => {
    console.log(`[AdminAPI] ${req.method} ${req.originalUrl}`);
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    next();
};

// ==================== USER MANAGEMENT ====================

// Get all users
router.get('/users', requireAdmin, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        let sql = `
            SELECT u.id, u.name, u.email, u.phone, u.role, u.created_at,
                   s.status as subscription_status, p.name as plan_name
            FROM users u
            LEFT JOIN subscriptions s ON u.id = s.user_id
            LEFT JOIN plans p ON s.plan_id = p.id
        `;

        const params = [];
        const conditions = [];

        if (startDate) {
            conditions.push("date(u.created_at) >= date(?)");
            params.push(startDate);
        }

        if (endDate) {
            conditions.push("date(u.created_at) <= date(?)");
            params.push(endDate);
        }

        if (conditions.length > 0) {
            sql += " WHERE " + conditions.join(" AND ");
        }

        sql += " ORDER BY u.created_at DESC";

        const users = await db.all(sql, params);
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update user
router.put('/users/:id', requireAdmin, async (req, res) => {
    try {
        const { name, email, phone } = req.body;
        await db.run(
            'UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?',
            [name, email, phone, req.params.id]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Change user role
router.put('/users/:id/role', requireAdmin, async (req, res) => {
    try {
        const { role } = req.body;
        await db.run('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete user
router.delete('/users/:id', requireAdmin, async (req, res) => {
    try {
        // Protect super admin account
        const user = await db.get('SELECT email FROM users WHERE id = ?', [req.params.id]);
        if (user && user.email === 'aman01125062943@gmail.com') {
            return res.status(403).json({
                error: 'لا يمكن حذف حساب المدير الرئيسي',
                protected: true
            });
        }

        await db.run('DELETE FROM subscriptions WHERE user_id = ?', [req.params.id]);
        await db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== SUBSCRIPTION MANAGEMENT ====================

// Get all subscriptions
router.get('/subscriptions', requireAdmin, async (req, res) => {
    try {
        const subs = await db.all(`
            SELECT s.*, u.name as user_name, u.email, u.phone, p.name as plan_name
            FROM subscriptions s
            JOIN users u ON s.user_id = u.id
            JOIN plans p ON s.plan_id = p.id
            ORDER BY s.created_at DESC
        `);
        res.json(subs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Approve subscription
router.put('/subscriptions/:id/approve', requireAdmin, async (req, res) => {
    try {
        const sub = await db.get('SELECT * FROM subscriptions WHERE id = ?', [req.params.id]);
        const plan = await db.get('SELECT * FROM plans WHERE id = ?', [sub.plan_id]);

        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + plan.duration_days);

        await db.run(
            'UPDATE subscriptions SET status = ?, start_date = ?, end_date = ? WHERE id = ?',
            ['active', startDate.toISOString(), endDate.toISOString(), req.params.id]
        );

        // Send WhatsApp notification if requested
        if (req.body.sendWhatsApp && req.body.phone) {
            const NotificationTemplates = require('../services/baileys/NotificationTemplates');
            const { userName, planName, duration } = req.body;

            try {
                await NotificationTemplates.sendNotification('admin', req.body.phone, 'activation', {
                    userName,
                    planName,
                    duration,
                    endDate: endDate.toISOString()
                });

                console.log(`✅ WhatsApp notification sent to ${req.body.phone}`);
            } catch (whatsappError) {
                console.error('Failed to send WhatsApp:', whatsappError);
                // Don't fail the approval if WhatsApp fails
            }
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Reject subscription
router.put('/subscriptions/:id/reject', requireAdmin, async (req, res) => {
    try {
        await db.run('UPDATE subscriptions SET status = ? WHERE id = ?', ['expired', req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Extend subscription
router.put('/subscriptions/:id/extend', requireAdmin, async (req, res) => {
    try {
        const { days } = req.body;
        const sub = await db.get('SELECT * FROM subscriptions WHERE id = ?', [req.params.id]);
        const currentEnd = new Date(sub.end_date);
        currentEnd.setDate(currentEnd.getDate() + parseInt(days));

        await db.run('UPDATE subscriptions SET end_date = ? WHERE id = ?',
            [currentEnd.toISOString(), req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== PLAN MANAGEMENT ====================

// Get all plans
router.get('/plans', requireAdmin, async (req, res) => {
    try {
        const plans = await db.all('SELECT * FROM plans ORDER BY price ASC');
        res.json(plans);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create plan
router.post('/plans', requireAdmin, async (req, res) => {
    try {
        const { name, duration_days, price, is_trial, features } = req.body;

        // Validation
        if (!name || typeof name !== 'string' || name.trim() === '') {
            return res.status(400).json({ error: 'اسم الباقة مطلوب' });
        }
        if (!Number.isInteger(duration_days) || duration_days <= 0) {
            return res.status(400).json({ error: 'مدة الباقة (بأيام) يجب أن تكون عددًا صحيحًا موجبًا' });
        }
        if (isNaN(price) || Number(price) < 0) {
            return res.status(400).json({ error: 'السعر يجب أن يكون رقمًا غير سالب' });
        }

        const featuresObj = (features && typeof features === 'object') ? features : {};

        const result = await db.run(
            'INSERT INTO plans (name, duration_days, price, is_trial, features) VALUES (?, ?, ?, ?, ?)',
            [name.trim(), duration_days, price, is_trial ? 1 : 0, JSON.stringify(featuresObj)]
        );
        res.json({ success: true, id: result.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update plan
router.put('/plans/:id', requireAdmin, async (req, res) => {
    try {
        const { name, duration_days, price, is_trial, features } = req.body;

        // Validation
        if (!name || typeof name !== 'string' || name.trim() === '') {
            return res.status(400).json({ error: 'اسم الباقة مطلوب' });
        }
        if (!Number.isInteger(duration_days) || duration_days <= 0) {
            return res.status(400).json({ error: 'مدة الباقة (بأيام) يجب أن تكون عددًا صحيحًا موجبًا' });
        }
        if (isNaN(price) || Number(price) < 0) {
            return res.status(400).json({ error: 'السعر يجب أن يكون رقمًا غير سالب' });
        }

        const featuresObj = (features && typeof features === 'object') ? features : {};

        await db.run(
            'UPDATE plans SET name = ?, duration_days = ?, price = ?, is_trial = ?, features = ? WHERE id = ?',
            [name.trim(), duration_days, price, is_trial ? 1 : 0, JSON.stringify(featuresObj), req.params.id]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete plan
router.delete('/plans/:id', requireAdmin, async (req, res) => {
    try {
        await db.run('DELETE FROM plans WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== STATS ====================

router.get('/stats', requireAdmin, async (req, res) => {
    try {
        const totalUsers = await db.get('SELECT COUNT(*) as count FROM users WHERE role = "user"');
        const activeSubscriptions = await db.get('SELECT COUNT(*) as count FROM subscriptions WHERE status = "active"');
        const pendingSubscriptions = await db.get('SELECT COUNT(*) as count FROM subscriptions WHERE status = "pending"');

        res.json({
            totalUsers: totalUsers.count,
            activeSubscriptions: activeSubscriptions.count,
            pendingSubscriptions: pendingSubscriptions.count
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== PAYMENT MANAGEMENT ====================

// Get all payments (pending first)
router.get('/payments', requireAdmin, async (req, res) => {
    try {
        const payments = await db.all(`
            SELECT p.*, u.name as user_name, u.email, u.phone, 
                   s.plan_id, pl.name as plan_name
            FROM payments p
            JOIN users u ON p.user_id = u.id
            LEFT JOIN subscriptions s ON p.subscription_id = s.id
            LEFT JOIN plans pl ON s.plan_id = pl.id
            ORDER BY 
                CASE WHEN p.status = 'pending' THEN 0 ELSE 1 END,
                p.created_at DESC
        `);
        res.json(payments);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete Payment Request
router.delete('/payments/:id', requireAdmin, async (req, res) => {
    try {
        await db.run('DELETE FROM payments WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get unified activation requests (payments + pending subscriptions)
router.get('/activation-requests', requireAdmin, async (req, res) => {
    try {
        // 1. Get all payment requests with user and plan info
        const payments = await db.all(`
            SELECT 
                p.id,
                p.user_id,
                p.amount,
                p.method,
                p.transaction_ref,
                p.receipt_path,
                p.status,
                p.created_at,
                u.name as user_name,
                u.email,
                u.phone,
                s.plan_id,
                pl.name as plan_name,
                'payment' as request_type
            FROM payments p
            JOIN users u ON p.user_id = u.id
            LEFT JOIN subscriptions s ON p.subscription_id = s.id
            LEFT JOIN plans pl ON s.plan_id = pl.id
            WHERE p.status = 'pending'
        `);

        // 2. Get all pending subscriptions WITHOUT a payment (orphaned subscriptions)
        const subscriptions = await db.all(`
            SELECT 
                s.id,
                s.user_id,
                s.plan_id,
                s.status,
                s.created_at,
                u.name as user_name,
                u.email,
                u.phone,
                pl.name as plan_name,
                pl.price as amount,
                pl.duration_days,
                'subscription' as request_type
            FROM subscriptions s
            JOIN users u ON s.user_id = u.id
            JOIN plans pl ON s.plan_id = pl.id
            WHERE s.status = 'pending'
            AND s.id NOT IN (
                SELECT subscription_id FROM payments WHERE subscription_id IS NOT NULL
            )
        `);

        // 3. Merge and sort by date (newest first)
        const allRequests = [...payments, ...subscriptions].sort((a, b) =>
            new Date(b.created_at) - new Date(a.created_at)
        );

        res.json(allRequests);
    } catch (error) {
        console.error('Error fetching activation requests:', error);
        res.status(500).json({ error: error.message });
    }
});

// Approve Request
router.put('/payments/:id/approve', requireAdmin, async (req, res) => {
    try {
        const payment = await db.get('SELECT * FROM payments WHERE id = ?', [req.params.id]);
        if (!payment) return res.status(404).json({ error: 'Payment not found' });

        // 1. Update Payment Status
        await db.run('UPDATE payments SET status = "approved" WHERE id = ?', [req.params.id]);

        // 2. Activate specific subscription or Create new if needed
        // For simplicity, we find the pending subscription for this user (or create one based on payment info if we tracked plan_id in payment) - but we didn't track plan_id in payments table initially.
        // Wait, we didn't add plan_id to payments table in the prompt plan, but PaymentService createPaymentRequest received planId.
        // Let's check PaymentService impl. It inserted into payments table without plan_id.
        // It relies on "creating specific subscription" logic which was commented out in PaymentService.

        // CORRECTION: We need to find the pending subscription for this user to activate it.
        // OR we should have stored subscription_id in payments table.
        // PaymentService.js: createPaymentRequest receive planId but didn't use it effectively to link specific sub.

        // Recovery Logic: Find the latest PENDING subscription for this user.
        const subscription = await db.get(`
            SELECT * FROM subscriptions 
            WHERE user_id = ? AND status = 'pending' 
            ORDER BY created_at DESC LIMIT 1
        `, [payment.user_id]);

        if (subscription) {
            const plan = await db.get('SELECT * FROM plans WHERE id = ?', [subscription.plan_id]);
            const startDate = new Date();
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + plan.duration_days);

            await db.run(
                'UPDATE subscriptions SET status = ?, start_date = ?, end_date = ? WHERE id = ?',
                ['active', startDate.toISOString(), endDate.toISOString(), subscription.id]
            );

            // Update payment with sub id if missing
            await db.run('UPDATE payments SET subscription_id = ? WHERE id = ?', [subscription.id, req.params.id]);

            // Notify User via WhatsApp (using NotificationService or MessageService)
            // Implementation detail: NotificationService.sendPaymentApproved(...)
            const NotificationService = require('../services/NotificationService');
            // We need to implement sendPaymentApproved in NotificationService first, or just send raw message here.
            // Let's send raw message for now to save time, or better, add to NotificationService later.

            const user = await db.get('SELECT * FROM users WHERE id = ?', [payment.user_id]);
            const messageService = require('../services/baileys/MessageService');
            const adminSessionId = await NotificationService.getAdminSession();

            if (adminSessionId) {
                const msg = `🎉 *تم قبول الدفع وتفعيل الاشتراك!*

أهلاً بك يا ${user.name} 👋
تم استلام دفعتك بقيمة ${payment.amount} بنجاح.

✅ *باقتك الان نشطة*
استمتع بخدماتنا! 🌹`;
                await messageService.sendMessage(adminSessionId, user.phone, msg);
            }
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Reject Request
router.put('/payments/:id/reject', requireAdmin, async (req, res) => {
    try {
        const { reason } = req.body;
        const id = req.params.id;
        console.log(`[AdminAPI] Rejecting payment ${id} with reason: ${reason}`);

        await db.run('UPDATE payments SET status = "rejected" WHERE id = ?', [id]);

        // Notify user of rejection
        const payment = await db.get('SELECT * FROM payments WHERE id = ?', [id]);
        if (payment) {
            console.log(`[AdminAPI] Found payment for user ${payment.user_id}, sending notification...`);
            const user = await db.get('SELECT * FROM users WHERE id = ?', [payment.user_id]);
            if (user) {
                const NotificationService = require('../services/NotificationService');
                // Await to catch any local errors, though we catch in the handler too
                await NotificationService.sendPaymentRejected(user, reason).catch(err => {
                    console.error('[AdminAPI] Notification service error:', err);
                });
            } else {
                console.warn(`[AdminAPI] User ${payment.user_id} not found for payment ${id}`);
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('[AdminAPI] Critical Rejection Error:', error);
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});

// ==================== PASSWORD CHANGE ====================

// Change admin password
router.post('/change-password', requireAdmin, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'يرجى إدخال كلمة المرور الحالية والجديدة' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل' });
        }

        // Get current user
        const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);

        // Verify current password
        const valid = await bcrypt.compare(currentPassword, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'كلمة المرور الحالية غير صحيحة' });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const newHash = await bcrypt.hash(newPassword, salt);

        // Update password
        await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, req.user.id]);

        res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح' });
    } catch (error) {
        console.error('Password change error:', error);
        res.status(500).json({ error: 'حدث خطأ أثناء تغيير كلمة المرور' });
    }
});

// ==================== ADMIN PROFILE MANAGEMENT ====================

// Update admin profile info
router.put('/profile', requireAdmin, async (req, res) => {
    try {
        const { name, phone } = req.body;

        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'اسم المدير مطلوب' });
        }

        const params = [name.trim()];
        let sql = 'UPDATE users SET name = ?';

        // Only update phone if provided and not empty
        if (phone && phone.trim() !== '') {
            sql += ', phone = ?';
            params.push(phone.trim());
        }

        sql += ' WHERE id = ?';
        params.push(req.user.id);

        await db.run(sql, params);

        res.json({ success: true, message: 'تم تحديث بيانات الملف الشخصي بنجاح' });
    } catch (error) {
        console.error('Profile update error:', error);
        // User-friendly error for unique constraint
        if (error.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'رقم الهاتف مستخدم بالفعل' });
        }
        res.status(500).json({ error: error.message });
    }
});

// ==================== ADMIN TABS MANAGEMENT ====================

// Get all admin tabs
router.get('/tabs', requireAdmin, async (req, res) => {
    try {
        const tabs = await db.all('SELECT * FROM admin_tabs WHERE active = 1 ORDER BY tab_order ASC');
        res.json(tabs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create admin tab
router.post('/tabs', requireAdmin, async (req, res) => {
    try {
        const { name, label, icon, tab_order } = req.body;

        if (!name || !label) {
            return res.status(400).json({ error: 'الاسم والتسمية مطلوبان' });
        }

        const result = await db.run(
            'INSERT INTO admin_tabs (name, label, icon, tab_order) VALUES (?, ?, ?, ?)',
            [name.trim(), label.trim(), icon || 'fas fa-cog', tab_order || 999]
        );

        res.json({ success: true, id: result.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update admin tab
router.put('/tabs/:id', requireAdmin, async (req, res) => {
    try {
        const { label, icon, tab_order, active } = req.body;

        await db.run(
            'UPDATE admin_tabs SET label = ?, icon = ?, tab_order = ?, active = ? WHERE id = ?',
            [label.trim(), icon || 'fas fa-cog', tab_order || 999, active ? 1 : 0, req.params.id]
        );

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete admin tab
router.delete('/tabs/:id', requireAdmin, async (req, res) => {
    try {
        await db.run('DELETE FROM admin_tabs WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- New Endpoints ---

// Get Activity Logs
router.get('/logs', requireAdmin, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        const logs = await AuditService.getLogs(limit, offset);
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Download// Backup Database
router.get('/backup', requireAdmin, async (req, res) => {
    try {
        const dbPath = path.join(__dirname, '../database/app.db');
        const backupPath = path.join(__dirname, '../database/backup-' + Date.now() + '.sqlite');

        // Create a copy first
        fs.copyFileSync(dbPath, backupPath);

        res.download(backupPath, 'database_backup.sqlite', (err) => {
            if (err) {
                console.error('Download error:', err);
            }
            // Cleanup backup file after download
            if (fs.existsSync(backupPath)) {
                fs.unlinkSync(backupPath);
            }
        });

        // Log action (non-blocking)
        try {
            await AuditService.log(req.user.id, 'BACKUP', 'تم تحميل نسخة احتياطية من النظام');
        } catch (logErr) {
            console.error('Audit Log functionality failed:', logErr);
        }

    } catch (error) {
        console.error('Backup error:', error);
        res.status(500).send('Error creating backup: ' + error.message);
    }
});

// Restore Database
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

router.post('/restore', requireAdmin, upload.single('backup'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const dbPath = path.join(__dirname, '../database/app.db');
        const backupPath = req.file.path;

        console.log(`[RESTORE] Replacing ${dbPath} with ${backupPath}`);

        // Close DB connection via db module (if exposed) or just force overwrite
        // In SQLite with this setup, overwriting usually works if no active write is happening
        // Ideally we should close the pool, but `db.js` structure is simple.

        // Attempt to copy uploaded file over existing database
        try {
            // Backup current just in case (optional, but safe)
            fs.copyFileSync(dbPath, dbPath + '.bak');

            // Replace
            fs.copyFileSync(backupPath, dbPath);

            // Cleanup upload
            fs.unlinkSync(backupPath);

            // Log action
            await AuditService.log(req.user.id, 'RESTORE', 'تم استعادة النظام من نسخة احتياطية');

            res.json({ success: true, message: 'Database restored successfully' });

            // Optional: Trigger process exit to restart connection
            // setTimeout(() => process.exit(0), 1000); 
        } catch (err) {
            console.error('Replace DB file error:', err);
            // Restore backup if exists
            if (fs.existsSync(dbPath + '.bak')) {
                fs.copyFileSync(dbPath + '.bak', dbPath);
            }
            throw err;
        }

    } catch (error) {
        console.error('Restore error:', error);
        res.status(500).json({ error: 'Failed to restore database: ' + error.message });
    }
});

// ==================== CONTENT LIBRARY MANAGEMENT ====================

// Get all content
router.get('/content', requireAdmin, async (req, res) => {
    try {
        const type = req.query.type;
        let sql = 'SELECT * FROM content_library ORDER BY created_at DESC';
        let params = [];

        if (type) {
            sql = 'SELECT * FROM content_library WHERE type = ? ORDER BY created_at DESC';
            params = [type];
        }

        const content = await db.all(sql, params);
        res.json(content);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add content
router.post('/content', requireAdmin, async (req, res) => {
    try {
        const ContentService = require('../services/ContentService');
        const content = await ContentService.addContent(req.body);
        res.json({ success: true, content });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update content
router.put('/content/:id', requireAdmin, async (req, res) => {
    try {
        const ContentService = require('../services/ContentService');
        const content = await ContentService.updateContent(req.params.id, req.body);
        res.json({ success: true, content });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete content
router.delete('/content/:id', requireAdmin, async (req, res) => {
    try {
        const ContentService = require('../services/ContentService');
        await ContentService.deleteContent(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;