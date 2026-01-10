const { db } = require('../db');

async function migrate() {
    console.log('🔄 Starting migration: Adding fadl column to content_library...');
    
    return new Promise((resolve, reject) => {
        db.run("ALTER TABLE content_library ADD COLUMN fadl TEXT", (err) => {
            if (err) {
                if (err.message.includes('duplicate column name')) {
                    console.log('⚠️ Column fadl already exists. Skipping.');
                    resolve();
                } else {
                    console.error('❌ Migration failed:', err);
                    reject(err);
                }
            } else {
                console.log('✅ Column fadl added successfully.');
                resolve();
            }
        });
    });
}

migrate()
    .then(() => {
        console.log('✅ Migration completed.');
        process.exit(0);
    })
    .catch((err) => {
        console.error('❌ Migration failed details:', err);
        process.exit(1);
    });
