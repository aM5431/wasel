const { db } = require('../db');

async function migrate() {
    console.log('🔄 Starting Hadith & Quran Settings Migration...');

    const columnsToAdd = [
        { name: 'hadith_enabled', type: 'INTEGER DEFAULT 1' },
        { name: 'hadith_time', type: "TEXT DEFAULT '12:00'" },
        { name: 'quran_enabled', type: 'INTEGER DEFAULT 0' },
        { name: 'quran_time', type: "TEXT DEFAULT '09:00'" },
        { name: 'quran_pages_per_day', type: 'INTEGER DEFAULT 3' }
    ];

    for (const col of columnsToAdd) {
        try {
            await db.run(`ALTER TABLE adhkar_settings ADD COLUMN ${col.name} ${col.type}`);
            console.log(`✅ Added column: ${col.name}`);
        } catch (error) {
            if (error.message && error.message.includes('duplicate column name')) {
                console.log(`ℹ️ Column ${col.name} already exists.`);
            } else {
                console.error(`❌ Error adding column ${col.name}:`, error.message);
            }
        }
    }

    console.log('✅ Migration completed.');
    process.exit(0);
}

migrate();
