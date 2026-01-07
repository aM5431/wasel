(async () => {
    try {
        const { db } = require('../src/database/db');

        const admins = await db.all('SELECT id, name, phone, role FROM users WHERE role = "admin"');
        const sessions = await db.all('SELECT session_id, user_id, connected, phone_number, created_at FROM whatsapp_sessions ORDER BY created_at DESC');

        console.log('ADMINS:', JSON.stringify(admins, null, 2));
        console.log('SESSIONS:', JSON.stringify(sessions, null, 2));
    } catch (err) {
        console.error('Error querying DB:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
})();
