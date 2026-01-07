(async () => {
    try {
        const { db } = require('../src/database/db');
        const user = await db.get("SELECT * FROM users WHERE role != 'admin' ORDER BY created_at DESC LIMIT 1");
        if (!user) {
            console.log('No non-admin users found');
            return;
        }
        const subscription = await db.get('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', [user.id]);
        console.log('LATEST_NONADMIN_USER:', JSON.stringify(user, null, 2));
        console.log('LATEST_NONADMIN_SUBSCRIPTION:', JSON.stringify(subscription, null, 2));
    } catch (err) {
        console.error('Error querying DB:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
})();
