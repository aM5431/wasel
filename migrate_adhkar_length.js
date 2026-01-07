const { db } = require('./src/database/db');

async function migrate() {
    try {
        console.log('--- Migrating Adhkar Settings: check for text_length column ---');

        // Check if column exists
        const tableInfo = await db.all("PRAGMA table_info(adhkar_settings)");
        const hasColumn = tableInfo.some(col => col.name === 'text_length');

        if (!hasColumn) {
            console.log('Adding text_length column...');
            await db.run("ALTER TABLE adhkar_settings ADD COLUMN text_length TEXT DEFAULT 'full'");
            console.log('✅ Column added successfully (default: full).');
        } else {
            console.log('ℹ️ Column text_length already exists.');
        }

    } catch (error) {
        console.error('Migration Error:', error);
    }
}

migrate();
