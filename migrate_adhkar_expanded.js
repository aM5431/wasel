const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'src/database/app.db');
const db = new sqlite3.Database(dbPath);

console.log('🔄 Starting Expanded Adhkar Settings Migration...');

db.serialize(() => {
    // Add frequency
    db.run("ALTER TABLE adhkar_settings ADD COLUMN frequency TEXT DEFAULT 'daily'", (err) => {
        if (err && !err.message.includes('duplicate column')) console.error('Error adding frequency:', err.message);
        else console.log('✅ Added frequency column (or exists)');
    });

    // Add parts_per_day
    db.run("ALTER TABLE adhkar_settings ADD COLUMN parts_per_day INTEGER DEFAULT 1", (err) => {
        if (err && !err.message.includes('duplicate column')) console.error('Error adding parts_per_day:', err.message);
        else console.log('✅ Added parts_per_day column (or exists)');
    });

    // Add randomize_schedule
    db.run("ALTER TABLE adhkar_settings ADD COLUMN randomize_schedule INTEGER DEFAULT 0", (err) => {
        if (err && !err.message.includes('duplicate column')) console.error('Error adding randomize_schedule:', err.message);
        else console.log('✅ Added randomize_schedule column (or exists)');
    });
});

db.close(() => {
    console.log('🏁 Migration completed.');
});
