const SchedulerService = require('./src/services/SchedulerService');
const { db } = require('./src/database/db');

async function testSend() {
    try {
        console.log('Testing Adhkar Send for conf-yvhhaepfn...');
        const config = await db.get(`
            SELECT c.*, 
                   a.morning_enabled, a.morning_time, a.morning_source,
                   a.evening_enabled, a.evening_time, a.evening_source,
                   a.text_length
            FROM islamic_reminders_config c
            LEFT JOIN adhkar_settings a ON a.config_id = c.id
            WHERE c.id = "conf-yvhhaepfn"
        `);
        
        if (config) {
            console.log('Config found, triggering evening adhkar...');
            await SchedulerService.sendUserContentReminder(config, 'adhkar', 'evening', config.evening_source);
            console.log('Triggered.');
        } else {
            console.log('Config not found.');
        }
    } catch (e) {
        console.error(e);
    } finally {
        setTimeout(() => process.exit(), 5000); // Give it time to send
    }
}
testSend();