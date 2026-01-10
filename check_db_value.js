const { db } = require('./src/database/db');
async function check() {
    try {
        const settings = await db.all('SELECT config_id, show_source_link FROM adhkar_settings');
        console.log('Adhkar Settings:', settings);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
check();