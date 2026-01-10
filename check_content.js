const { db } = require('./src/database/db');
async function check() {
    try {
        const recipients = await db.all('SELECT * FROM reminder_recipients');
        console.log('Recipients:', recipients);
        
        const configs = await db.all('SELECT * FROM adhkar_settings');
        console.log('Adhkar Settings:', configs);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
check();