(async () => {
    try {
        const NotificationService = require('../src/services/NotificationService');
        const { db } = require('../src/database/db');

        // Choose target user - latest non-admin or admin if none
        let user = await db.get("SELECT * FROM users WHERE role != 'admin' ORDER BY created_at DESC LIMIT 1");
        if (!user) {
            user = await db.get("SELECT * FROM users ORDER BY created_at DESC LIMIT 1");
        }

        console.log('Sending welcome to:', user);
        const res = await NotificationService.sendWelcome(user);
        console.log('sendWelcome result:', res);
    } catch (err) {
        console.error('Error during sendWelcome test:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
})();
