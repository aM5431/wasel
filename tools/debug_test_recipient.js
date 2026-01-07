const { db } = require('../src/database/db');
const IslamicRemindersService = require('../src/services/IslamicRemindersService');
const messageService = require('../src/services/baileys/MessageService');

async function debugTestRecipient() {
    const recipientId = '14bbaadc-1ad4-4759-8c53-a04050372a2b';
    console.log(`Debugging test-recipient for ID: ${recipientId}`);

    try {
        // Mocking req.user.id - assuming user_id 1 based on previous interactions or common patterns
        // Let's find a valid user first
        const user = await db.get('SELECT id FROM users LIMIT 1');
        if (!user) throw new Error('No users found in database');
        
        const userId = user.id;
        console.log(`Using User ID: ${userId}`);

        const config = await IslamicRemindersService.getOrCreateConfig(userId);
        console.log(`Config found: ${config.id}, Session: ${config.session_id}`);

        if (!config.session_id) {
            console.log('❌ No session linked');
            return;
        }

        const recipient = await db.get('SELECT * FROM reminder_recipients WHERE id = ?', [recipientId]);
        if (!recipient) {
            console.log('❌ Recipient not found in DB');
            return;
        }
        console.log(`Recipient found: ${recipient.name} (${recipient.whatsapp_id})`);

        const message = 'Test debug message';
        console.log('Calling messageService.sendMessage...');
        
        try {
            await messageService.sendMessage(config.session_id, recipient.whatsapp_id, message);
            console.log('✅ Message sent successfully');
        } catch (sendError) {
            console.error('❌ messageService.sendMessage FAILED:', sendError.message);
        }

    } catch (err) {
        console.error('❌ Debug script failed:', err);
    }
    process.exit(0);
}

debugTestRecipient();
