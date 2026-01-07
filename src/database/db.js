const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.NODE_ENV === 'test' ? ':memory:' : path.join(__dirname, 'app.db');
const db = new sqlite3.Database(dbPath);

// Async Wrapper
const dbAsync = {
    get: (sql, params = []) => new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    }),
    all: (sql, params = []) => new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    }),
    run: (sql, params = []) => new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve({ id: this.lastID, changes: this.changes });
        });
    }),
    exec: (sql) => new Promise((resolve, reject) => {
        db.exec(sql, (err) => {
            if (err) reject(err);
            else resolve();
        });
    })
};

async function init() {
    console.log('Initializing Database Schema...');

    const schema = `
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT UNIQUE NOT NULL,
        email TEXT,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        duration_days INTEGER NOT NULL,
        price REAL NOT NULL,
        is_trial BOOLEAN DEFAULT 0,
        features TEXT
    );

    CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        type TEXT DEFAULT 'info',
        is_read INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    );

    -- Islamic Reminders System Tables --
    
    CREATE TABLE IF NOT EXISTS islamic_reminders_config (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        session_id TEXT,
        location_country TEXT,
        location_city TEXT,
        latitude REAL,
        longitude REAL,
        timezone TEXT DEFAULT 'Africa/Cairo',
        prayer_calculation_method TEXT DEFAULT 'MWL',
        hijri_adjustment INTEGER DEFAULT 0,
        friday_kahf INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(session_id) REFERENCES whatsapp_sessions(session_id)
    );

    CREATE TABLE IF NOT EXISTS prayer_settings (
        id TEXT PRIMARY KEY,
        config_id TEXT NOT NULL,
        prayer_name TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        reminder_before_minutes INTEGER DEFAULT 10,
        send_adhan INTEGER DEFAULT 1,
        send_after_reminder INTEGER DEFAULT 0,
        adhan_sound TEXT,
        FOREIGN KEY(config_id) REFERENCES islamic_reminders_config(id)
    );

    CREATE TABLE IF NOT EXISTS fasting_settings (
        id TEXT PRIMARY KEY,
        config_id TEXT NOT NULL,
        monday_thursday INTEGER DEFAULT 0,
        white_days INTEGER DEFAULT 0,
        ashura INTEGER DEFAULT 0,
        dhul_hijjah_first_10 INTEGER DEFAULT 0,
        dhul_hijjah_first_10 INTEGER DEFAULT 0,
        ramadan_alerts INTEGER DEFAULT 1,
        monday INTEGER DEFAULT 0,
        thursday INTEGER DEFAULT 0,
        reminder_time TEXT DEFAULT '20:00',
        FOREIGN KEY(config_id) REFERENCES islamic_reminders_config(id)
    );

    CREATE TABLE IF NOT EXISTS content_library (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        category TEXT,
        content_ar TEXT NOT NULL,
        source TEXT,
        media_url TEXT,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reminder_recipients (
        id TEXT PRIMARY KEY,
        config_id TEXT NOT NULL,
        type TEXT NOT NULL,
        whatsapp_id TEXT NOT NULL,
        name TEXT,
        enabled INTEGER DEFAULT 1,
        FOREIGN KEY(config_id) REFERENCES islamic_reminders_config(id)
    );

    CREATE TABLE IF NOT EXISTS scheduled_reminders (
        id TEXT PRIMARY KEY,
        config_id TEXT NOT NULL,
        reminder_type TEXT NOT NULL,
        scheduled_time DATETIME NOT NULL,
        content_id TEXT,
        custom_message TEXT,
        status TEXT DEFAULT 'pending',
        sent_at DATETIME,
        FOREIGN KEY(config_id) REFERENCES islamic_reminders_config(id),
        FOREIGN KEY(content_id) REFERENCES content_library(id)
    );

    CREATE TABLE IF NOT EXISTS prayer_times_cache (
        id TEXT PRIMARY KEY,
        location_key TEXT NOT NULL,
        prayer_date DATE NOT NULL,
        fajr TIME,
        sunrise TIME,
        dhuhr TIME,
        asr TIME,
        maghrib TIME,
        isha TIME,
        hijri_date TEXT,
        cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(location_key, prayer_date)
    );

    -- End Islamic Reminders Tables --

    CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        plan_id INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        start_date DATETIME,
        end_date DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(plan_id) REFERENCES plans(id)
    );

    CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT
    );

    CREATE TABLE IF NOT EXISTS whatsapp_sessions (
        session_id TEXT PRIMARY KEY,
        user_id TEXT,
        device_type TEXT,
        name TEXT,
        connected BOOLEAN DEFAULT 0,
        webhook_url TEXT,
        phone_number TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        subscription_id INTEGER,
        amount REAL NOT NULL,
        method TEXT NOT NULL,
        transaction_ref TEXT,
        receipt_path TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(subscription_id) REFERENCES subscriptions(id)
    );

    CREATE TABLE IF NOT EXISTS admin_tabs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        icon TEXT DEFAULT 'fas fa-cog',
        tab_order INTEGER DEFAULT 999,
        active BOOLEAN DEFAULT 1,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    `;

    // Adhkar Settings Table
    await dbAsync.run(`
    CREATE TABLE IF NOT EXISTS adhkar_settings (
        id TEXT PRIMARY KEY,
        config_id TEXT NOT NULL,
        morning_enabled INTEGER DEFAULT 1,
        morning_time TEXT DEFAULT '07:00',
        morning_source TEXT DEFAULT 'mixed',
        evening_enabled INTEGER DEFAULT 1,
        evening_time TEXT DEFAULT '17:00',
        evening_source TEXT DEFAULT 'mixed',
        hadith_enabled INTEGER DEFAULT 1,
        hadith_time TEXT DEFAULT '12:00',
        hadith_source TEXT DEFAULT 'mixed',
        media_preference TEXT DEFAULT 'mixed',
        content_enabled INTEGER DEFAULT 1,
        content_time TEXT DEFAULT '21:00',
        content_type TEXT DEFAULT 'mixed',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(config_id) REFERENCES islamic_reminders_config(id)
    )`);

    // Migration: Add media_preference if not exists
    try {
        await dbAsync.run(`ALTER TABLE adhkar_settings ADD COLUMN media_preference TEXT DEFAULT 'mixed'`);
    } catch (e) { /* Ignore if exists */ }
    try { await dbAsync.run(`ALTER TABLE adhkar_settings ADD COLUMN content_enabled INTEGER DEFAULT 1`); } catch (e) { }
    try { await dbAsync.run(`ALTER TABLE adhkar_settings ADD COLUMN content_time TEXT DEFAULT '21:00'`); } catch (e) { }
    try { await dbAsync.run(`ALTER TABLE adhkar_settings ADD COLUMN content_type TEXT DEFAULT 'mixed'`); } catch (e) { }

    await dbAsync.exec(schema);

    // Seed Adhkar Settings for existing configs if missing
    try {
        const configs = await dbAsync.all('SELECT id FROM islamic_reminders_config');
        const insertAdhkar = `INSERT INTO adhkar_settings (id, config_id) VALUES (?, ?)`;

        for (const config of configs) {
            const check = await dbAsync.get('SELECT id FROM adhkar_settings WHERE config_id = ?', [config.id]);
            if (!check) {
                // Generate a UUID (requires uuid import inside init? or use simple random for DB seeding inside db.js if uuid not available scope)
                // db.js usually does not import uuid. But IslamicRemindersService does.
                // We'll use a random string or placeholder since it's TEXT PRIMARY KEY.
                // Actually, let's use a simple distinct string generator or rely on Service to create it on demand?
                // Ideally, migrate existing.
                // I will use Date.now() + random for ID in this migration script context.
                const newId = 'adhkar-' + Math.random().toString(36).substr(2, 9);
                await dbAsync.run(insertAdhkar, [newId, config.id]);
                console.log(`Seeded adhkar_settings for config ${config.id}`);
            }
        }
    } catch (error) {
        console.error('Error seeding adhkar settings:', error);
    }

    // Add missing columns if they don't exist
    try {
        await dbAsync.run('ALTER TABLE whatsapp_sessions ADD COLUMN phone_number TEXT');
    } catch (e) { }

    try {
        await dbAsync.run('ALTER TABLE islamic_reminders_config ADD COLUMN hijri_adjustment INTEGER DEFAULT 0');
    } catch (e) { }

    try {
        await dbAsync.run('ALTER TABLE islamic_reminders_config ADD COLUMN friday_kahf INTEGER DEFAULT 1');
    } catch (e) { }

    try {
        await dbAsync.run("ALTER TABLE fasting_settings ADD COLUMN reminder_time TEXT DEFAULT '20:00'");
    } catch (e) { }

    // Add last_sent_at to content_library
    try {
        await dbAsync.run('ALTER TABLE content_library ADD COLUMN last_sent_at DATETIME');
    } catch (e) { }

    // Add source settings to adhkar_settings
    try {
        await dbAsync.run("ALTER TABLE adhkar_settings ADD COLUMN morning_source TEXT DEFAULT 'mixed'");
        await dbAsync.run("ALTER TABLE adhkar_settings ADD COLUMN evening_source TEXT DEFAULT 'mixed'");
        await dbAsync.run("ALTER TABLE adhkar_settings ADD COLUMN hadith_source TEXT DEFAULT 'mixed'");
    } catch (e) { }

    try {
        await dbAsync.run('ALTER TABLE whatsapp_sessions ADD COLUMN last_connected DATETIME');
        console.log('Added last_connected column to whatsapp_sessions table');
    } catch (error) {
        if (!error.message.includes('duplicate column name')) {
            console.error('Error adding last_connected column:', error.message);
        }
    }

    try {
        await dbAsync.run('ALTER TABLE whatsapp_sessions ADD COLUMN last_disconnected DATETIME');
        console.log('Added last_disconnected column to whatsapp_sessions table');
    } catch (error) {
        if (!error.message.includes('duplicate column name')) {
            console.error('Error adding last_disconnected column:', error.message);
        }
    }

    // Add max_sessions column if it doesn't exist
    try {
        await dbAsync.run('ALTER TABLE plans ADD COLUMN max_sessions INTEGER DEFAULT 1');
        console.log('Added max_sessions column to plans table');
    } catch (error) {
        if (!error.message.includes('duplicate column name')) {
            console.error('Error adding max_sessions column:', error.message);
        }
    }

    // Add last_login column to users for onboarding detection
    try {
        await dbAsync.run('ALTER TABLE users ADD COLUMN last_login DATETIME');
        console.log('Added last_login column to users table');
    } catch (error) {
        if (!error.message.includes('duplicate column name')) {
            console.error('Error adding last_login column:', error.message);
        }
    }

    // Add monday and thursday columns to fasting_settings
    try {
        await dbAsync.run('ALTER TABLE fasting_settings ADD COLUMN monday INTEGER DEFAULT 0');
        console.log('Added monday column to fasting_settings table');
    } catch (error) {
        if (!error.message.includes('duplicate column name')) {
            console.error('Error adding monday column:', error.message);
        }
    }

    try {
        await dbAsync.run('ALTER TABLE fasting_settings ADD COLUMN thursday INTEGER DEFAULT 0');
        console.log('Added thursday column to fasting_settings table');
    } catch (error) {
        if (!error.message.includes('duplicate column name')) {
            console.error('Error adding thursday column:', error.message);
        }
    }

    // Add hijri_adjustment to islamic_reminders_config
    try {
        await dbAsync.run('ALTER TABLE islamic_reminders_config ADD COLUMN hijri_adjustment INTEGER DEFAULT 0');
        console.log('Added hijri_adjustment column to islamic_reminders_config table');
    } catch (error) {
        if (!error.message.includes('duplicate column name')) {
            console.error('Error adding hijri_adjustment column:', error.message);
        }
    }

    // Add friday_kahf to islamic_reminders_config
    try {
        await dbAsync.run('ALTER TABLE islamic_reminders_config ADD COLUMN friday_kahf INTEGER DEFAULT 1');
        console.log('Added friday_kahf column to islamic_reminders_config table');
    } catch (error) {
        if (!error.message.includes('duplicate column name')) {
            console.error('Error adding friday_kahf column:', error.message);
        }
    }

    // Add manual prayer times columns to islamic_reminders_config
    try {
        await dbAsync.run('ALTER TABLE islamic_reminders_config ADD COLUMN prayer_time_mode TEXT DEFAULT \'auto\'');
        console.log('Added prayer_time_mode column to islamic_reminders_config table');
    } catch (error) {
        if (!error.message.includes('duplicate column name')) {
            console.error('Error adding prayer_time_mode column:', error.message);
        }
    }

    try {
        await dbAsync.run('ALTER TABLE islamic_reminders_config ADD COLUMN manual_fajr TEXT');
        console.log('Added manual_fajr column to islamic_reminders_config table');
    } catch (error) {
        if (!error.message.includes('duplicate column name')) {
            console.error('Error adding manual_fajr column:', error.message);
        }
    }

    try {
        await dbAsync.run('ALTER TABLE islamic_reminders_config ADD COLUMN manual_dhuhr TEXT');
        console.log('Added manual_dhuhr column to islamic_reminders_config table');
    } catch (error) {
        if (!error.message.includes('duplicate column name')) {
            console.error('Error adding manual_dhuhr column:', error.message);
        }
    }

    try {
        await dbAsync.run('ALTER TABLE islamic_reminders_config ADD COLUMN manual_asr TEXT');
        console.log('Added manual_asr column to islamic_reminders_config table');
    } catch (error) {
        if (!error.message.includes('duplicate column name')) {
            console.error('Error adding manual_asr column:', error.message);
        }
    }

    try {
        await dbAsync.run('ALTER TABLE islamic_reminders_config ADD COLUMN manual_maghrib TEXT');
        console.log('Added manual_maghrib column to islamic_reminders_config table');
    } catch (error) {
        if (!error.message.includes('duplicate column name')) {
            console.error('Error adding manual_maghrib column:', error.message);
        }
    }

    try {
        await dbAsync.run('ALTER TABLE islamic_reminders_config ADD COLUMN manual_isha TEXT');
        console.log('Added manual_isha column to islamic_reminders_config table');
    } catch (error) {
        if (!error.message.includes('duplicate column name')) {
            console.error('Error adding manual_isha column:', error.message);
        }
    }

    // Seed Default Plans
    const checkPlans = await dbAsync.get('SELECT count(*) as count FROM plans');
    if (checkPlans.count === 0) {
        console.log('Seeding default plans...');
        const insertPlan = 'INSERT INTO plans (name, duration_days, price, is_trial, features, max_sessions) VALUES (?, ?, ?, ?, ?, ?)';

        await dbAsync.run(insertPlan, ['باقة تجريبية', 7, 0, 1, JSON.stringify({ prayer_times: true, adhkar: true }), 1]);
        await dbAsync.run(insertPlan, ['باقة شهرية', 30, 299, 0, JSON.stringify({ prayer_times: true, adhkar: true, support: true }), 5]);
        await dbAsync.run(insertPlan, ['باقة سنوية', 365, 2999, 0, JSON.stringify({ prayer_times: true, adhkar: true, support: true }), 10]);
    } else {
        // Update existing plans with new default limits
        console.log('Updating existing plans limits...');
        await dbAsync.run("UPDATE plans SET max_sessions = 1 WHERE name LIKE '%تجريبية%' OR is_trial = 1");
        await dbAsync.run("UPDATE plans SET max_sessions = 5 WHERE name LIKE '%شهرية%'");
        await dbAsync.run("UPDATE plans SET max_sessions = 10 WHERE name LIKE '%سنوية%'");
    }

    // Seed Default Admin Tabs
    const checkTabs = await dbAsync.get('SELECT count(*) as count FROM admin_tabs');
    if (checkTabs.count === 0) {
        console.log('Seeding default admin tabs...');
        const insertTab = 'INSERT INTO admin_tabs (name, label, icon, tab_order, active) VALUES (?, ?, ?, ?, ?)';

        try {
            await dbAsync.run(insertTab, ['dashboard', 'لوحة المعلومات', 'fas fa-chart-line', 1, 1]);
            await dbAsync.run(insertTab, ['whatsapp', 'جلساتي', 'fab fa-whatsapp', 2, 1]);
            await dbAsync.run(insertTab, ['subscriptions', 'منتظرين التفعيل', 'fas fa-clock', 3, 1]);
            await dbAsync.run(insertTab, ['payments', 'طلبات التفعيل', 'fas fa-money-bill-wave', 4, 1]);
            await dbAsync.run(insertTab, ['users', 'إدارة المستخدمين', 'fas fa-users', 5, 1]);
            await dbAsync.run(insertTab, ['plans', 'إدارة الباقات', 'fas fa-box', 6, 1]);
            await dbAsync.run(insertTab, ['logs', 'سجل النشاط', 'fas fa-history', 7, 1]);
            await dbAsync.run(insertTab, ['settings', 'الإعدادات', 'fas fa-cog', 8, 1]);
            console.log('✅ Default admin tabs seeded successfully');
        } catch (err) {
            console.error('Error seeding admin tabs:', err.message);
        }
    } else {
        console.log(`ℹ️  Admin tabs already exist (${checkTabs.count} tabs)`);

        // Add missing tabs if they don't exist
        try {
            const tabsToEnsure = [
                { name: 'logs', label: 'سجل النشاطات', icon: 'fas fa-history', order: 7, active: 1, description: 'سجل جميع العمليات والأنشطة' },
                { name: 'settings', label: 'الإعدادات', icon: 'fas fa-cog', order: 8, active: 1, description: 'إعدادات النظام العامة' },
                { name: 'islamic_reminders', label: 'التذكيرات الإسلامية', icon: 'fas fa-mosque', order: 9, active: 1, description: 'نظام التذكيرات الإسلامية الآلي' },
                { name: 'content_library', label: 'مكتبة المحتوى', icon: 'fas fa-book-open', order: 10, active: 1, description: 'إدارة الأذكار والأحاديث' }
            ];

            for (const tab of tabsToEnsure) {
                const existingTab = await dbAsync.get('SELECT id FROM admin_tabs WHERE name = ?', [tab.name]);
                if (!existingTab) {
                    await dbAsync.run(
                        'INSERT INTO admin_tabs (name, label, icon, tab_order, active, description) VALUES (?, ?, ?, ?, ?, ?)',
                        [tab.name, tab.label, tab.icon, tab.order, tab.active, tab.description]
                    );
                    console.log(`➕ Added missing admin tab: ${tab.name}`);
                }
            }
        } catch (error) {
            console.error('Error adding admin tabs:', error);
        }
    }

    // Create Activity Logs Table
    try {
        await dbAsync.run(`
            CREATE TABLE IF NOT EXISTS activity_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT,
                action TEXT NOT NULL,
                details TEXT,
                ip_address TEXT,
                user_agent TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
        `);
        console.log('✅ Activity logs table check/create done');
    } catch (e) {
        console.error('Error creating activity_logs table:', e.message);
    }

    console.log('Database Schema Initialized.');
}

module.exports = {
    db: dbAsync,
    init
};
