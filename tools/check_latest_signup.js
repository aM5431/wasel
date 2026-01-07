(async () => {
    try {
        const { db } = require('../src/database/db');
        const user = await db.get('SELECT * FROM users ORDER BY created_at DESC LIMIT 1');
        const subscription = await db.get('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', [user?.id]);
        const sessions = await db.all('SELECT session_id, user_id, connected, phone_number FROM whatsapp_sessions');
        console.log('LATEST_USER:', JSON.stringify(user, null, 2));
        console.log('LATEST_SUBSCRIPTION:', JSON.stringify(subscription, null, 2));
        console.log('WHATSAPP_SESSIONS:', JSON.stringify(sessions, null, 2));
    } catch (err) {
        console.error('Error querying DB:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
})();
