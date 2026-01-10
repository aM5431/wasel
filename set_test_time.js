const { db } = require('./src/database/db');
async function update() {
    try {
        // ضبط الوقت ليكون بعد دقيقتين من الآن للتجربة
        await db.run('UPDATE adhkar_settings SET evening_time = "13:05", evening_enabled = 1 WHERE config_id = "conf-yvhhaepfn"');
        console.log('✅ تم تحديث وقت أذكار المساء إلى 13:05 لتجربة الإرسال التلقائي');
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
update();