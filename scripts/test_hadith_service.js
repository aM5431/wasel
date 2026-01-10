const HadithService = require('../src/services/HadithService');
const { db } = require('../src/database/db');

async function test() {
    console.log('🧪 Testing HadithService...');

    // Allow DB to connect
    setTimeout(async () => {
        try {
            await HadithService.init();

            // Wait for fetch to likely complete (sections fetch is async)
            console.log('⏳ Waiting for fetch...');
            await new Promise(r => setTimeout(r, 8000));

            const hadith = await HadithService.getRandomHadith();
            if (hadith) {
                console.log('✅ Fetched Random Hadith Successfully:');
                console.log('Content:', hadith.content_ar.substring(0, 50) + '...');
                console.log('Source:', hadith.source);
            } else {
                console.error('❌ No hadith found in cache.');
            }
        } catch (e) {
            console.error('❌ Test failed:', e);
        } finally {
            process.exit(0);
        }
    }, 1000);
}

test();
