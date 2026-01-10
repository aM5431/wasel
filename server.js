const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const ServerOptimizer = require('./src/services/ServerOptimizer');

// Apply Node.js optimizations
ServerOptimizer.optimizeNodeJS();

// Prevent crashes from unhandled rejections (common with Baileys/Libsignal)
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Do not exit the process, just log it
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Do not exit the process, just log it
});


const app = express();
const PORT = process.env.PORT || 5000;

// Apply helmet early with standard security (CSP handled by ServerOptimizer)
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false
}));

// Apply server optimizations
ServerOptimizer.applyOptimizations(app);

// Database & Services
const { init: initDB, db } = require('./src/database/db');
const SettingsService = require('./src/services/settings');
const PlanService = require('./src/services/plans');
const AuthService = require('./src/services/auth');
const SessionManager = require('./src/services/baileys/SessionManager');
const { authenticateToken, generateToken } = require('./src/middleware/auth');
const adminRoutes = require('./src/routes/admin');

// Initialize with enhanced error handling
app.init = async () => {
    try {
        await initDB();
        await SettingsService.initDefaults();

        // Initialize Scheduler Service (Islamic Reminders)
        const SchedulerService = require('./src/services/SchedulerService');
        SchedulerService.init();

        // Seed Content Library
        const ContentService = require('./src/services/ContentService');
        await ContentService.seedInitialContent();

        // Initialize Hadith Service (API Cache)
        const HadithService = require('./src/services/HadithService');
        await HadithService.init();

        // Auto-restore WhatsApp sessions on startup
        setTimeout(async () => {
            console.log('🚀 [Server] Starting automatic session restoration...');
            await SessionManager.restoreAllSessions();
        }, 10000); // Wait 10 seconds after server start to ensure all services are ready

        console.log('Server initialization completed');
    } catch (e) {
        console.error('Failed to initialize:', e);
        process.exit(1);
    }
};

// Add JSON parsing error handler
app.use(express.json({
    limit: '10mb',
    verify: (req, res, buf, encoding) => {
        try {
            if (buf && buf.length) {
                JSON.parse(buf);
            }
        } catch (error) {
            console.error('JSON Parse Error:', error.message);
            console.error('Raw body:', buf.toString());
            throw new Error('Invalid JSON format');
        }
    }
}));

app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views'));

// Favicon route
app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'favicon.png'));
});

// Admin API Routes
app.use('/api/admin', authenticateToken, adminRoutes);

// Enhanced WhatsApp API Routes with security
const whatsappRoutes = require('./src/routes/whatsapp');
app.use('/api', (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[API-LOG] ${req.method} ${req.originalUrl} - Status: ${res.statusCode} (${duration}ms)`);
    });
    next();
});
app.use('/api/whatsapp', authenticateToken, whatsappRoutes);

// Islamic Reminders Routes (accessible to all authenticated users)
const islamicRemindersRoutes = require('./src/routes/islamic-reminders');
app.use('/dashboard', authenticateToken, islamicRemindersRoutes);
app.use('/api/islamic-reminders', authenticateToken, islamicRemindersRoutes);

// Hadith API Routes
app.use('/api/hadith', authenticateToken, require('./src/routes/hadith'));
app.use('/api/adhkar', authenticateToken, require('./src/routes/adhkar'));

// Payment Routes (Public for validation)
app.use('/payment', require('./src/routes/payment'));

// Routes
app.use('/', require('./src/routes/auth'));

// Redirect legacy /dashboard/whatsapp to hash-based route
app.get('/dashboard/whatsapp', authenticateToken, (req, res) => {
    res.redirect('/dashboard#whatsapp');
});

app.get('/', async (req, res) => {
    try {
        const settings = await SettingsService.get('landing_page');
        const plans = await PlanService.getAll();

        res.render('landing', {
            title: settings.hero.title || 'منصة واتساب',
            hero: settings.hero,
            features: settings.features,
            pricing: settings.pricing,
            plans: plans,
            settings: settings
        });
    } catch (e) {
        res.status(500).send('Error loading page: ' + e.message);
    }
});

// Middleware to fetch fresh user data from DB for dashboard pages
const fetchFreshUser = async (req, res, next) => {
    if (req.user && req.user.id) {
        try {
            const freshUser = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
            if (freshUser) {
                // Keep password_hash out of the req.user for security
                delete freshUser.password_hash;
                req.user = { ...req.user, ...freshUser };
            }
        } catch (err) {
            console.error('Error fetching fresh user:', err);
        }
    }
    next();
};

app.use('/dashboard', authenticateToken, fetchFreshUser);

// Middleware to prevent caching of sensitive pages
const nocache = (req, res, next) => {
    res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.header('Expires', '-1');
    res.header('Pragma', 'no-cache');
    next();
};

app.get('/dashboard', nocache, async (req, res) => {
    // Fetch Subscription Details for User
    const sub = await db.get(`
        SELECT s.*, p.name as plan_name, p.is_trial, p.features, p.max_sessions 
        FROM subscriptions s
        JOIN plans p ON s.plan_id = p.id
        WHERE s.user_id = ?
        ORDER BY s.created_at DESC LIMIT 1
    `, [req.user.id]);

    // Strict Access Control:
    // If user is NOT admin and does NOT have an active subscription (pending, expired, or none),
    // redirect them to the login page as requested.
    if (req.user.role !== 'admin' && (!sub || sub.status !== 'active')) {
        return res.redirect('/login');
    }

    // Parse User Features
    let userFeatures = {
        prayer_times: true,
        adhkar: true,
        morning_evening: true,
        before_after_prayer: true,
        quran: true,
        hadith: true,
        fasting: true,
        rosary: true,
        support: true
    };

    if (req.user.role !== 'admin' && sub && sub.features) {
        try {
            const features = JSON.parse(sub.features);
            userFeatures = {
                prayer_times: !!features.prayer_times,
                adhkar: !!features.adhkar,
                morning_evening: !!(features.morning_evening || features.adhkar),
                before_after_prayer: !!(features.before_after_prayer || features.adhkar),
                quran: !!(features.quran || features.adhkar),
                hadith: !!(features.hadith || features.adhkar),
                fasting: !!features.fasting,
                rosary: !!features.rosary,
                support: !!features.support
            };
        } catch (e) {
            console.error('Error parsing sub features:', e);
            userFeatures = {
                prayer_times: false,
                adhkar: false,
                morning_evening: false,
                before_after_prayer: false,
                quran: false,
                hadith: false,
                fasting: false,
                rosary: false,
                support: false
            };
        }
    }

    if (req.user.role === 'admin') {
        return res.render('dashboard/admin', {
            user: req.user,
            userFeatures,
            maxSessions: sub ? (sub.max_sessions || 999) : 999
        });
    }

    let percentRemaining = 0;
    let daysRemaining = 0;
    if (sub && sub.status === 'active') {
        const start = new Date(sub.start_date);
        const end = new Date(sub.end_date);
        const now = new Date();
        const total = end - start;
        const elapsed = now - start;
        percentRemaining = Math.max(0, Math.min(100, ((total - elapsed) / total) * 100));
        daysRemaining = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
    }

    res.render('dashboard/user', {
        user: req.user,
        subscription: sub ? { ...sub, percentRemaining, daysRemaining } : null,
        userFeatures,
        maxSessions: sub ? (sub.max_sessions || 1) : 1
    });
});


// Admin Settings Routes
app.get('/dashboard/settings', async (req, res) => {
    if (req.user.role !== 'admin') return res.redirect('/dashboard');

    const settings = await SettingsService.get('landing_page');
    res.render('dashboard/settings', { user: req.user, settings });
});

app.post('/dashboard/settings', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).send('Unauthorized');

    try {
        // Construct the settings object directly from the form body
        // In a real app, we would validate this schema strictly.
        const newSettings = {
            brand: { name: req.body.brand_name || 'واصل' },
            hero: {
                title: req.body.hero_title,
                subtitle: req.body.hero_subtitle,
                show: req.body.hero_show === 'on'
            },
            features: {
                title: req.body.features_title,
                show: req.body.features_show === 'on',
                items: [] // We will parse these from the dynamic list if possible, or simplified for now
            },
            pricing: {
                title: req.body.pricing_title,
                show: req.body.pricing_show === 'on'
            },
            payment: {
                vodafone_cash: {
                    enabled: req.body.payment_vodafone_enabled === 'on',
                    number: req.body.payment_vodafone_number,
                    instructions: req.body.payment_vodafone_instructions
                },
                instapay: {
                    enabled: req.body.payment_instapay_enabled === 'on',
                    address: req.body.payment_instapay_address,
                    phone: req.body.payment_instapay_phone,
                    instructions: req.body.payment_instapay_instructions
                }
            },
            contact: {
                whatsapp: req.body.contact_whatsapp,
                email: req.body.contact_email
            }
        };

        // Handle dynamic feature items
        if (req.body['features_items_title[]'] && req.body['features_items_desc[]']) {
            const titles = Array.isArray(req.body['features_items_title[]'])
                ? req.body['features_items_title[]']
                : [req.body['features_items_title[]']];

            const descs = Array.isArray(req.body['features_items_desc[]'])
                ? req.body['features_items_desc[]']
                : [req.body['features_items_desc[]']];

            newSettings.features.items = titles.map((title, index) => ({
                title: title,
                desc: descs[index] || ''
            }));
        } else {
            // Fallback: Preserve or use default if empty submission logic
            const oldSettings = await SettingsService.get('landing_page');
            newSettings.features.items = oldSettings.features.items;
        }

        await SettingsService.set('landing_page', newSettings);
        res.json({ success: true, message: 'Settings saved successfully' });
    } catch (e) {
        console.error('Settings Save Error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Health check endpoint for Docker
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// Global error handler for API routes
app.use('/api', (error, req, res, next) => {
    console.error('API Error:', error);
    if (res.headersSent) {
        return next(error);
    }
    res.status(500).json({ error: error.message || 'Internal server error' });
});

if (require.main === module) {
    app.init().then(() => {
        app.listen(PORT, () => {
            console.log(`Server is running on http://localhost:${PORT}`);
        });
    });
}

module.exports = app;
