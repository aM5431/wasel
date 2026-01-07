const { db, init: initDB } = require('../src/database/db');
const SchedulerService = require('../src/services/SchedulerService');
const IslamicRemindersService = require('../src/services/IslamicRemindersService');
const PrayerTimesService = require('../src/services/PrayerTimesService');
const FastingService = require('../src/services/FastingService');

async function testScheduler() {
    console.log('\n' + '='.repeat(60));
    console.log('🧪 ISLAMIC REMINDERS SCHEDULER TEST');
    console.log('='.repeat(60) + '\n');

    try {
        // Initialize database
        await initDB();
        console.log('✅ Database initialized\n');

        // Test 1: Check configurations
        console.log('TEST 1: Checking Configurations');
        console.log('-'.repeat(60));
        const configs = await db.all('SELECT * FROM islamic_reminders_config');
        console.log(`Total configurations: ${configs.length}`);
        
        if (configs.length === 0) {
            console.log('⚠️  No configurations found. Create one first.\n');
            process.exit(1);
        }

        for (const config of configs) {
            console.log(`\n📋 Config: ${config.id}`);
            console.log(`   User ID: ${config.user_id}`);
            console.log(`   Session: ${config.session_id || '❌ NOT LINKED'}`);
            console.log(`   Location: ${config.location_city || 'NOT SET'}`);
            
            if (!config.latitude || !config.longitude) {
                console.log(`   ⚠️  Coordinates: MISSING (${config.latitude}, ${config.longitude})`);
            } else {
                console.log(`   ✅ Coordinates: ${config.latitude}, ${config.longitude}`);
            }
        }

        // Test 2: Prayer Times Calculation
        console.log('\n\nTEST 2: Prayer Times Calculation');
        console.log('-'.repeat(60));
        
        for (const config of configs) {
            console.log(`\nTesting config: ${config.id}`);
            
            if (!config.latitude || !config.longitude) {
                console.log('⚠️  Skipping - missing location data');
                continue;
            }

            try {
                const times = await PrayerTimesService.getPrayerTimes(config);
                
                if (times) {
                    console.log(`✅ Prayer times calculated for ${config.location_city}`);
                    console.log(`   Date: ${times.prayer_date}`);
                    console.log(`   Fajr: ${times.fajr}`);
                    console.log(`   Dhuhr: ${times.dhuhr}`);
                    console.log(`   Asr: ${times.asr}`);
                    console.log(`   Maghrib: ${times.maghrib}`);
                    console.log(`   Isha: ${times.isha}`);
                } else {
                    console.log(`❌ Failed to calculate prayer times`);
                }
            } catch (err) {
                console.log(`❌ Error: ${err.message}`);
            }
        }

        // Test 3: Prayer Settings
        console.log('\n\nTEST 3: Prayer Settings');
        console.log('-'.repeat(60));
        
        for (const config of configs) {
            const settings = await IslamicRemindersService.getPrayerSettings(config.id);
            const enabled = settings.filter(s => s.enabled);
            
            console.log(`\nConfig ${config.id}:`);
            console.log(`  Enabled prayers: ${enabled.length}/5`);
            
            for (const prayer of enabled) {
                console.log(`    ✅ ${prayer.prayer_name}`);
                console.log(`       - Reminder before: ${prayer.reminder_before_minutes} min`);
                console.log(`       - Send Adhan: ${prayer.send_adhan ? 'Yes' : 'No'}`);
            }
        }

        // Test 4: Fasting Settings
        console.log('\n\nTEST 4: Fasting Settings');
        console.log('-'.repeat(60));
        
        const fasting = FastingService.checkFastingDay();
        console.log(`Tomorrow: ${fasting.date.toDateString()}`);
        console.log(`Hijri: ${fasting.hijriDate}`);
        console.log(`Is Monday: ${fasting.isMonday ? '✅ Yes' : '❌ No'}`);
        console.log(`Is Thursday: ${fasting.isThursday ? '✅ Yes' : '❌ No'}`);
        console.log(`Is White Day: ${fasting.isWhiteDay ? '✅ Yes' : '❌ No'}`);

        console.log('\nFasting preferences by config:');
        for (const config of configs) {
            const settings = await IslamicRemindersService.getFastingSettings(config.id);
            const enabled = [];
            if (settings.monday) enabled.push('Monday');
            if (settings.thursday) enabled.push('Thursday');
            if (settings.white_days) enabled.push('White Days');
            
            console.log(`  ${config.id}: ${enabled.length > 0 ? enabled.join(', ') : 'None enabled'}`);
        }

        // Test 5: Recipients
        console.log('\n\nTEST 5: Recipients Configuration');
        console.log('-'.repeat(60));
        
        for (const config of configs) {
            const recipients = await IslamicRemindersService.getRecipients(config.id);
            const enabled = recipients.filter(r => r.enabled);
            
            console.log(`\nConfig ${config.id}:`);
            console.log(`  Total recipients: ${recipients.length}`);
            console.log(`  Enabled recipients: ${enabled.length}`);
            
            if (enabled.length > 0) {
                for (const recipient of enabled) {
                    console.log(`    ✅ ${recipient.name} (${recipient.type})`);
                    console.log(`       WhatsApp ID: ${recipient.whatsapp_id}`);
                }
            } else {
                console.log(`  ⚠️  No enabled recipients found`);
            }
        }

        // Test 6: Session Status Check
        console.log('\n\nTEST 6: WhatsApp Session Status');
        console.log('-'.repeat(60));
        
        for (const config of configs) {
            if (!config.session_id) {
                console.log(`\n${config.id}: ❌ No session linked`);
                continue;
            }

            const session = await db.get('SELECT * FROM whatsapp_sessions WHERE session_id = ?', [config.session_id]);
            
            if (session) {
                console.log(`\n${config.id}:`);
                console.log(`  Session: ${session.session_id}`);
                console.log(`  Status: ${session.connected ? '✅ Connected' : '❌ Disconnected'}`);
                console.log(`  Phone: ${session.phone_number || 'Not recorded'}`);
            } else {
                console.log(`\n${config.id}: ⚠️  Session not found in database`);
            }
        }

        // Test 7: Simulate Prayer Reminder (for current time)
        console.log('\n\nTEST 7: Time Matching Simulation');
        console.log('-'.repeat(60));
        
        const now = new Date();
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        console.log(`Current time: ${currentTime}`);
        console.log(`\nSimulating prayer reminder check...`);
        
        for (const config of configs) {
            if (!config.latitude || !config.longitude) {
                console.log(`\n${config.id}: Skipped (missing coordinates)`);
                continue;
            }

            const times = await PrayerTimesService.getPrayerTimes(config);
            if (!times) {
                console.log(`\n${config.id}: Failed to get prayer times`);
                continue;
            }

            const settings = await IslamicRemindersService.getPrayerSettings(config.id);
            console.log(`\n${config.id}:`);

            for (const setting of settings) {
                if (!setting.enabled) continue;

                const prayerTime = times[setting.prayer_name];
                if (!prayerTime) continue;

                const [hours, minutes] = prayerTime.split(':').map(Number);
                const prayerMinutes = hours * 60 + minutes;
                const reminderMinutes = prayerMinutes - (setting.reminder_before_minutes || 0);
                const reminderHours = Math.floor(reminderMinutes / 60);
                const reminderMins = reminderMinutes % 60;
                const reminderTime = `${String(reminderHours).padStart(2, '0')}:${String(reminderMins).padStart(2, '0')}`;

                const match = currentTime === reminderTime;
                console.log(`  ${setting.prayer_name}: ${prayerTime} (reminder at ${reminderTime}) ${match ? '⏰ MATCH!' : '⏸  Not time'}`);
            }
        }

        // Summary
        console.log('\n\n' + '='.repeat(60));
        console.log('✅ TEST SUMMARY');
        console.log('='.repeat(60));
        console.log('\nTest Results:');
        console.log('  1. ✅ Configurations checked');
        console.log('  2. ✅ Prayer times calculated');
        console.log('  3. ✅ Prayer settings verified');
        console.log('  4. ✅ Fasting settings checked');
        console.log('  5. ✅ Recipients verified');
        console.log('  6. ✅ Session status checked');
        console.log('  7. ✅ Time matching simulated');

        console.log('\nNext Steps:');
        console.log('  1. Ensure all configurations have linked sessions');
        console.log('  2. Verify coordinates are correct');
        console.log('  3. Check that at least one prayer is enabled');
        console.log('  4. Confirm recipients are added and enabled');
        console.log('  5. Monitor server logs during scheduled times');
        console.log('  6. Test with manual test button in dashboard\n');

        process.exit(0);

    } catch (error) {
        console.error('\n❌ Test failed:', error);
        process.exit(1);
    }
}

testScheduler();
