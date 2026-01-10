const { db } = require('./src/database/db');
async function update() {
    try {
        await db.run('UPDATE adhkar_settings SET evening_time = "12:54", evening_enabled = 1 WHERE config_id = "conf-yvhhaepfn"');
        console.log('Updated evening_time to 12:54 for config conf-yvhhaepfn');
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
update();