const { db } = require('./src/database/db');
async function migrate() {
    try {
        await db.run('ALTER TABLE adhkar_settings ADD COLUMN show_source_link INTEGER DEFAULT 1');
        console.log('✅ Added show_source_link column to adhkar_settings');
    } catch (e) {
        console.log('Column might already exist');
    } finally {
        process.exit();
    }
}
migrate();