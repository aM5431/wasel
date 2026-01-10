const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const PaymentService = require('../services/PaymentService');
const AuthService = require('../services/auth');
const SettingsService = require('../services/settings');
const NotificationService = require('../services/NotificationService');

// Configure Multer for local storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../../public/uploads/payments');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'payment-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Only images allowed!'));
    }
});

// Render Payment Page
router.get('/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { plan: planId } = req.query;

        // This route might usually be protected, but if redirected from register, user might not be logged in fully yet?
        // Actually auth.js redirects to /payment/:userId if status != active.
        // So we assume public access but validated by ID existence? Better to rely on session/cookie if possible.
        // For security, checking if req.user exists if authenticated.

        // Fetch plan details
        const { db } = require('../database/db');
        const plan = await db.get('SELECT * FROM plans WHERE id = ?', [planId || 1]); // Default to first plan if missing

        // Fetch payment settings
        const settings = await SettingsService.get('landing_page');
        const paymentMethods = settings.payment || {
            vodafone_cash: { enabled: true, number: '01066284516' },
            instapay: { enabled: true, address: 'aminkhaled@instapay' }
        };

        res.render('payment', { userId, plan, paymentMethods });

    } catch (error) {
        res.status(500).send('Error loading payment page: ' + error.message);
    }
});

// Handle Payment Submission
router.post('/submit', upload.single('receipt'), async (req, res) => {
    try {
        const { userId, planId, amount, method, transactionRef } = req.body;
        const file = req.file;

        console.log('[Payment Submit] Request:', { userId, planId, amount, hasFile: !!file });

        if (!file) {
            return res.status(400).send('يرجى رفع صورة الإيصال');
        }

        // Save to database
        const receiptPath = '/uploads/payments/' + file.filename;
        await PaymentService.createPaymentRequest(userId, planId, amount, method, transactionRef, receiptPath);
        console.log('✅ Payment request saved to DB');

        const { db } = require('../database/db');
        const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
        const plan = await db.get('SELECT * FROM plans WHERE id = ?', [planId]);

        // Send notification in background (don't wait for it)
        NotificationService.sendPaymentNotification({
            userId,
            userName: user?.name || 'Unknown',
            userPhone: user?.phone || 'Unknown',
            planName: plan?.name || 'Unknown',
            amount,
            method,
            transactionRef
        }, receiptPath).then(() => {
            console.log('✅ Admin notification sent');
        }).catch(err => {
            console.warn('⚠️ Notification failed:', err.message);
        });

        // Create DB notification for admin dashboard
        await NotificationService.createAdminNotification(
            'طلب دفع جديد 💰',
            `قام ${user?.name || 'مستخدم'} بإرسال إيصال دفع بمبلغ ${amount} ج.م`,
            'warning'
        );

        // Immediately show success page to user (don't wait for WhatsApp)
        res.render('payment_success', {
            userName: user?.name,
            planName: plan?.name,
            amount
        });

    } catch (error) {
        console.error('❌ Payment submission error:', error);
        res.status(500).send('حدث خطأ أثناء معالجة الطلب. يرجى المحاولة مرة أخرى.');
    }
});

module.exports = router;
