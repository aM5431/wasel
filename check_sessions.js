const { db } = require('./src/database/db');
async function checkSessions() {
    try {
        const sessions = await db.all('SELECT * FROM whatsapp_sessions');
        console.log('Sessions:', sessions);
        const configs = await db.all('SELECT id, user_id, session_id FROM islamic_reminders_config');
        console.log('Configs:', configs);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
checkSessions();