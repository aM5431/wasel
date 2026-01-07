const { db } = require('./db');
(async () => {
    try {
        const users = await db.all('SELECT id, name, email, role FROM users');
        console.log('Users found:', JSON.stringify(users, null, 2));
    } catch (error) {
        console.error('Error reading users:', error);
    }
})();
