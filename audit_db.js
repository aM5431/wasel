const { db } = require('./src/database/db');

async function audit() {
    try {
        console.log('--- DATABASE AUDIT ---');

        const contentStats = await db.all('SELECT type, category, COUNT(*) as count FROM content_library GROUP BY type, category');
        console.log('\nContent Statistics:');
        console.table(contentStats);

        const sampleAdhkar = await db.all('SELECT * FROM content_library WHERE type = "adhkar" LIMIT 5');
        console.log('\nSample Adhkar:');
        sampleAdhkar.forEach(a => console.log(`[${a.category}] ${a.content_ar.substring(0, 50)}... (Source: ${a.source})`));

        const sampleHadith = await db.all('SELECT * FROM content_library WHERE type = "hadith_cached" LIMIT 5');
        console.log('\nSample Cached Hadiths:');
        sampleHadith.forEach(h => console.log(`[${h.category}] ${h.content_ar.substring(0, 100)}... (Source: ${h.source})`));

        const brokenLinks = await db.all('SELECT * FROM content_library WHERE content_ar LIKE "%http%" OR content_ar LIKE "%www%"');
        console.log(`\nPotential URLs in content body: ${brokenLinks.length}`);

    } catch (err) {
        console.error('Audit failed:', err);
    }
}

audit();
