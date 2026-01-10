const { db } = require('./src/database/db');

async function checkContent() {
    console.log('🔍 Verifying Adhkar Content...');

    db.all("SELECT id, type, substr(content_ar, 1, 30) as preview, source, fadl FROM content_library WHERE type IN ('adhkar_morning', 'adhkar_evening') LIMIT 5", [], (err, rows) => {
        if (err) {
            console.error('❌ Query failed:', err);
        } else {
            console.log(`✅ Found ${rows.length} items.\n`);
            rows.forEach(row => {
                console.log(`----------------------------------------`);
                console.log(`Type: ${row.type}`);
                console.log(`Preview: ${row.preview}...`);
                console.log(`Source: ${row.source}`);
                console.log(`Fadl: ${row.fadl}`);
            });
            console.log(`----------------------------------------`);
        }
        // Force close to exit
        setTimeout(() => process.exit(0), 500);
    });
}

checkContent();
