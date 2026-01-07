const express = require('express');
const router = express.Router();
const AuthService = require('../services/auth');
const NotificationService = require('../services/NotificationService');
const { db } = require('../database/db');
const { generateToken } = require('../middleware/auth');
const AuditService = require('../services/AuditService');

router.get('/register', (req, res) => {
    const planId = req.query.plan || 1;
    res.render('register', { planId });
});

router.post('/register', async (req, res) => {
    try {
        const result = await AuthService.register(req.body);
        if (result.status === 'active') {
            const user = await db.get('SELECT * FROM users WHERE id = ?', [result.userId]);

            // Send trial activation notification (Fire & Forget)
            // Don't await this - let it run in background but log if it fails
            NotificationService.sendTrialActivation(user, result.plan, result.subscription)
                .then(success => {
                    if (success) {
                        console.log(`✅ Notification sent successfully to ${user.phone}`);
                    } else {
                        console.log(`⚠️ Notification failed - no admin session or error occurred`);
                    }
                })
                .catch(err => console.error('[Auth] Notification error:', err));

            const token = generateToken(user);
            res.cookie('token', token, { httpOnly: true });
            res.redirect('/dashboard');
        } else {
            res.redirect('/payment/' + result.userId + '?plan=' + result.plan?.id);
        }
    } catch (err) {
        res.render('register', { error: err.message, planId: req.body.planId });
    }
});

router.get('/login', (req, res) => {
    res.render('login');
});

router.post('/login', async (req, res) => {
    try {
        const user = await AuthService.login(req.body.identifier, req.body.password);
        // Fetch fresh user row to check last_login (migration may add this column)
        const dbUser = await db.get('SELECT * FROM users WHERE id = ?', [user.id]);

        const token = generateToken(user);
        res.cookie('token', token, { httpOnly: true });

        // If this is first login (no last_login), send onboarding welcome message
        try {
            const firstLogin = !dbUser || !dbUser.last_login;
            if (firstLogin) {
                NotificationService.sendWelcome(user)
                    .then(sent => console.log(`Welcome message sent: ${sent}`))
                    .catch(e => console.error('Welcome send error:', e));
            }

            // Update last_login timestamp (best-effort)
            await db.run('UPDATE users SET last_login = ? WHERE id = ?', [new Date().toISOString(), user.id]);
        } catch (e) {
            console.error('Error handling first-login welcome:', e.message || e);
        }

        // Log successful login
        AuditService.log(user.id, 'LOGIN', { role: user.role }, req);

        // Check for active subscription
        const sub = await db.get(`
            SELECT status FROM subscriptions 
            WHERE user_id = ? 
            ORDER BY created_at DESC LIMIT 1
        `, [user.id]);

        // Admins bypass subscription check
        if (user.role === 'admin') {
            return res.redirect('/dashboard');
        }

        // Regular users need active subscription
        if (sub && sub.status === 'active') {
            res.redirect('/dashboard');
        } else {
            // Redirect to payment page, default to plan 1 if no plan known
            res.redirect(`/payment/${user.id}?plan=1`);
        }
    } catch (err) {
        res.render('login', { error: err.message });
    }
});

router.get('/logout', (req, res) => {
    // AuditService.log(req.user?.id || 'unknown', 'LOGOUT', {}, req); // User might not be available here, but token cookie is generic
    res.clearCookie('token');
    res.redirect('/');
});

module.exports = router;
