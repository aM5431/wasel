const { db } = require('./src/database/db');
async function updateSession() {
    try {
        await db.run('UPDATE islamic_reminders_config SET session_id = "user_admin-master-001_1767967456765" WHERE id = "conf-yvhhaepfn"');
        console.log('Linked config conf-yvhhaepfn to active session: user_admin-master-001_1767967456765');
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
updateSession();