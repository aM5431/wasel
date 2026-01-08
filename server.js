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

// Apply server optimizations with enhanced security
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
            try {
                console.log('🔄 Restoring WhatsApp sessions...');
                const { db } = require('./src/database/db');
                const SessionManager = require('./src/services/baileys/SessionManager');

                // Get all known sessions (try to restore everyone, connected or not)
                const sessions = await db.all('SELECT * FROM whatsapp_sessions');

                console.log(`Found ${sessions.length} sessions to restore (attempting reconnect)`);

                // Attempt restoration with per-session retry/backoff
                for (const session of sessions) {
                    const maxAttempts = 3;
                    let attempt = 0;
                    let restored = false;

                    while (attempt < maxAttempts && !restored) {
                        attempt++;
                        try {
                            console.log(`Restoring session (attempt ${attempt}/${maxAttempts}): ${session.name || session.session_id}`);

                            await SessionManager.createSession(session.session_id, {
                                isNew: false,
                                onConnected: async (info) => {
                                    console.log(`✅ Session ${session.session_id} connected successfully`);
                                    await db.run('UPDATE whatsapp_sessions SET connected = 1, last_connected = ? WHERE session_id = ?', [new Date().toISOString(), session.session_id]);
                                },
                                onDisconnected: async (reason) => {
                                    console.log(`❌ Session ${session.session_id} disconnected:`, reason?.message || reason);
                                    await db.run('UPDATE whatsapp_sessions SET connected = 0, last_disconnected = ? WHERE session_id = ?', [new Date().toISOString(), session.session_id]);
                                }
                            });

                            // If createSession resolved without throwing, consider it attempted; actual connection will call onConnected
                            restored = true;

                            // Small delay between session restorations
                            await new Promise(resolve => setTimeout(resolve, 1000));

                        } catch (sessionError) {
                            console.error(`Attempt ${attempt} failed for ${session.session_id}:`, sessionError.message || sessionError);
                            if (attempt < maxAttempts) {
                                const backoff = Math.min(2000 * Math.pow(2, attempt - 1), 10000);
                                console.log(`Retrying in ${backoff}ms...`);
                                await new Promise(resolve => setTimeout(resolve, backoff));
                            } else {
                                console.error(`Max attempts reached for ${session.session_id}. Marking disconnected.`);
                                await db.run('UPDATE whatsapp_sessions SET connected = 0, last_disconnected = ? WHERE session_id = ?', [new Date().toISOString(), session.session_id]);
                            }
                        }
                    }
                }

                console.log('🎉 Session restoration completed');
            } catch (error) {
                console.error('Error during session restoration:', error);
            }
        }, 5000); // Wait 5 seconds after server start

        console.log('Server initialization completed');
    } catch (e) {
        console.error('Failed to initialize:', e);
        process.exit(1);
    }
};

// Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'", "https:", "http:", "data:", "blob:", "ws:", "wss:"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https:", "http:"],
            styleSrc: ["'self'", "'unsafe-inline'", "https:", "http:"],
            imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
            connectSrc: ["'self'", "https:", "http:", "ws:", "wss:"],
            fontSrc: ["'self'", "https:", "http:", "data:"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'", "https:", "http:", "data:", "blob:"],
            frameSrc: ["'self'", "https:", "http:"],
            scriptSrcAttr: ["'unsafe-inline'"],
            upgradeInsecureRequests: null
        },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false
}));

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
app.use('/api/whatsapp', (req, res, next) => {
    console.log(`Whats App API Request: ${req.method} ${req.path}`);
    next();
}, authenticateToken, whatsappRoutes);

// Islamic Reminders Routes (accessible to all authenticated users)
const islamicRemindersRoutes = require('./src/routes/islamic-reminders');
app.use('/dashboard', authenticateToken, islamicRemindersRoutes);
app.use('/api/islamic-reminders', authenticateToken, islamicRemindersRoutes);

// Hadith API Routes
app.use('/api/hadith', authenticateToken, require('./src/routes/hadith'));

// Payment Routes (Public for validation)
app.use('/payment', require('./src/routes/payment'));

// Routes
app.use('/', require('./src/routes/auth'));

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

app.get('/dashboard', authenticateToken, async (req, res) => {
    if (req.user.role === 'admin') {
        return res.render('dashboard/admin', { user: req.user });
    }

    // Fetch Subscription Details for User
    const sub = await db.get(`
        SELECT s.*, p.name as plan_name, p.is_trial, p.features 
        FROM subscriptions s
        JOIN plans p ON s.plan_id = p.id
        WHERE s.user_id = ?
        ORDER BY s.created_at DESC LIMIT 1
    `, [req.user.id]);

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
        subscription: sub ? { ...sub, percentRemaining, daysRemaining } : null
    });
});



// Admin Settings Routes
app.get('/dashboard/settings', authenticateToken, async (req, res) => {
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
