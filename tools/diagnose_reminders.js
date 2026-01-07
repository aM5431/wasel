const { db } = require('../src/database/db');
const PrayerTimesService = require('../src/services/PrayerTimesService');
const FastingService = require('../src/services/FastingService');
const IslamicRemindersService = require('../src/services/IslamicRemindersService');
const SessionManager = require('../src/services/baileys/SessionManager');

async function diagnoseReminders() {
    console.log('='.repeat(60));
    console.log('🔍 ISLAMIC REMINDERS DIAGNOSTIC REPORT');
    console.log('='.repeat(60));
    console.log(`\n⏰ Timestamp: ${new Date().toISOString()}\n`);

    try {
        // 1. Check Database Connection
        console.log('1️⃣  DATABASE CONNECTION');
        console.log('-'.repeat(60));
        try {
            const testQuery = await db.get('SELECT COUNT(*) as count FROM users');
            console.log('✅ Database connected successfully');
            console.log(`   - Total users: ${testQuery.count}\n`);
        } catch (err) {
            console.error('❌ Database connection failed:', err.message, '\n');
            return;
        }

        // 2. Check Islamic Reminders Configuration
        console.log('2️⃣  ISLAMIC REMINDERS CONFIGURATION');
        console.log('-'.repeat(60));
        const configs = await db.all('SELECT * FROM islamic_reminders_config');
        console.log(`Total configs: ${configs.length}\n`);

        if (configs.length === 0) {
            console.log('⚠️  No Islamic reminder configurations found!\n');
        } else {
            for (const config of configs) {
                console.log(`📋 Config ID: ${config.id}`);
                console.log(`   User ID: ${config.user_id}`);
                console.log(`   Session ID: ${config.session_id || 'NOT LINKED'}`);
                console.log(`   Location: ${config.location_city || 'NOT SET'}`);
                console.log(`   Coordinates: ${config.latitude ? `${config.latitude}, ${config.longitude}` : 'MISSING'}`);
                console.log(`   Timezone: ${config.timezone || 'Africa/Cairo'}`);
                console.log(`   Prayer Method: ${config.prayer_calculation_method || 'MWL'}`);
                
                // Check prayer settings
                const prayers = await IslamicRemindersService.getPrayerSettings(config.id);
                const enabledPrayers = prayers.filter(p => p.enabled).map(p => p.prayer_name);
                console.log(`   Enabled Prayers: ${enabledPrayers.length > 0 ? enabledPrayers.join(', ') : 'NONE'}`);
                
                // Check fasting settings
                const fasting = await IslamicRemindersService.getFastingSettings(config.id);
                const fastingOptions = [];
                if (fasting.monday) fastingOptions.push('Monday');
                if (fasting.thursday) fastingOptions.push('Thursday');
                if (fasting.white_days) fastingOptions.push('White Days');
                console.log(`   Fasting Enabled: ${fastingOptions.length > 0 ? fastingOptions.join(', ') : 'NONE'}`);
                
                // Check recipients
                const recipients = await IslamicRemindersService.getRecipients(config.id);
                const enabledRecipients = recipients.filter(r => r.enabled);
                console.log(`   Recipients: ${enabledRecipients.length}/${recipients.length} enabled`);
                
                if (enabledRecipients.length > 0) {
                    for (const recipient of enabledRecipients) {
                        console.log(`      • ${recipient.name} (${recipient.type}) - ${recipient.whatsapp_id}`);
                    }
                }
                console.log('');
            }
        }

        // 3. Check WhatsApp Sessions Status
        console.log('3️⃣  WHATSAPP SESSIONS STATUS');
        console.log('-'.repeat(60));
        const sessions = await db.all('SELECT * FROM whatsapp_sessions');
        console.log(`Total sessions: ${sessions.length}\n`);

        if (sessions.length === 0) {
            console.log('⚠️  No WhatsApp sessions found!\n');
        } else {
            for (const session of sessions) {
                const sessionObj = SessionManager.getSession(session.session_id);
                const isConnected = sessionObj && sessionObj.user;
                
                console.log(`📱 Session: ${session.session_id}`);
                console.log(`   Name: ${session.name || 'Unnamed'}`);
                console.log(`   User ID: ${session.user_id}`);
                console.log(`   DB Status: ${session.connected ? '✅ Connected' : '❌ Disconnected'}`);
                console.log(`   Memory Status: ${isConnected ? '✅ Active' : '⚠️  Not loaded'}`);
                console.log(`   Last Connected: ${session.last_connected || 'Never'}`);
                console.log('');
            }
        }

        // 4. Check Prayer Times for Configured Locations
        console.log('4️⃣  PRAYER TIMES CALCULATION');
        console.log('-'.repeat(60));
        
        for (const config of configs) {
            if (!config.latitude || !config.longitude) {
                console.log(`⚠️  Config ${config.id}: Missing location data (latitude/longitude)`);
                continue;
            }
            
            const times = await PrayerTimesService.getPrayerTimes(config);
            if (!times) {
                console.log(`❌ Config ${config.id}: Failed to calculate prayer times`);
                continue;
            }

            console.log(`✅ Config ${config.id}: Prayer times calculated`);
            console.log(`   Location: ${config.location_city}`);
            console.log(`   Date: ${times.prayer_date}`);
            console.log(`   Hijri: ${times.hijri_date}`);
            console.log(`   Fajr: ${times.fajr} | Dhuhr: ${times.dhuhr} | Asr: ${times.asr}`);
            console.log(`   Maghrib: ${times.maghrib} | Isha: ${times.isha}`);
            console.log('');
        }

        // 5. Check Fasting Days
        console.log('5️⃣  FASTING DAYS (TOMORROW)');
        console.log('-'.repeat(60));
        const fastingStatus = FastingService.checkFastingDay();
        console.log(`Date: ${fastingStatus.date.toDateString()}`);
        console.log(`Hijri: ${fastingStatus.hijriDate}`);
        console.log(`Monday: ${fastingStatus.isMonday ? '✅ Yes' : '❌ No'}`);
        console.log(`Thursday: ${fastingStatus.isThursday ? '✅ Yes' : '❌ No'}`);
        console.log(`White Days: ${fastingStatus.isWhiteDay ? '✅ Yes' : '❌ No'}`);
        console.log(`Ashura: ${fastingStatus.isAshura ? '✅ Yes' : '❌ No'}`);
        console.log(`Arafah: ${fastingStatus.isArafah ? '✅ Yes' : '❌ No'}\n`);

        // 6. Scheduler Status
        console.log('6️⃣  SCHEDULER STATUS');
        console.log('-'.repeat(60));
        const now = new Date();
        console.log(`Current Time: ${now.toLocaleString('ar-EG')}`);
        console.log(`Next Scheduled Tasks:`);
        console.log(`  • 07:00 - Morning Adhkar (أذكار الصباح)`);
        console.log(`  • 12:00 - Daily Hadith (حديث اليوم)`);
        console.log(`  • 17:00 - Evening Adhkar (أذكار المساء)`);
        console.log(`  • 20:00 - Fasting Reminders (تذكيرات الصيام)`);
        console.log(`  • Every minute - Prayer Reminders (تذكيرات الصلوات)\n`);

        // 7. Recommendations
        console.log('7️⃣  DIAGNOSTIC SUMMARY & RECOMMENDATIONS');
        console.log('-'.repeat(60));
        
        const issues = [];
        const warnings = [];

        // Check for issues
        if (configs.length === 0) {
            issues.push('No Islamic reminder configurations found');
        } else {
            for (const config of configs) {
                if (!config.session_id) {
                    issues.push(`Config ${config.id}: No WhatsApp session linked`);
                }
                if (!config.latitude || !config.longitude) {
                    issues.push(`Config ${config.id}: Missing location data`);
                }
            }
        }

        if (sessions.length === 0) {
            issues.push('No WhatsApp sessions configured');
        } else {
            const disconnected = sessions.filter(s => !s.connected);
            if (disconnected.length > 0) {
                warnings.push(`${disconnected.length} WhatsApp session(s) disconnected`);
            }
        }

        // Display results
        if (issues.length === 0 && warnings.length === 0) {
            console.log('✅ ALL SYSTEMS OPERATIONAL\n');
        } else {
            if (issues.length > 0) {
                console.log('🚨 CRITICAL ISSUES:');
                issues.forEach((issue, i) => {
                    console.log(`   ${i + 1}. ${issue}`);
                });
                console.log('');
            }

            if (warnings.length > 0) {
                console.log('⚠️  WARNINGS:');
                warnings.forEach((warning, i) => {
                    console.log(`   ${i + 1}. ${warning}`);
                });
                console.log('');
            }
        }

        console.log('RECOMMENDATIONS:');
        console.log('  1. Ensure all users have linked WhatsApp sessions');
        console.log('  2. Set location and coordinates for each configuration');
        console.log('  3. Enable desired prayer reminders and fasting options');
        console.log('  4. Add at least one recipient (individual or group)');
        console.log('  5. Test sending reminders using the test buttons in dashboard');
        console.log('  6. Monitor server logs for any Scheduler errors');
        console.log('  7. Check that server timezone matches the prayer times timezone\n');

    } catch (error) {
        console.error('❌ Diagnostic error:', error);
    }

    console.log('='.repeat(60));
    console.log('End of diagnostic report\n');
    process.exit(0);
}

// Run diagnostic
diagnoseReminders().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
