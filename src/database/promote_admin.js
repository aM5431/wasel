const { db } = require('./db');
(async () => {
    try {
        const email = 'amin01066284516@gmail.com';
        await db.run("UPDATE users SET role = 'admin' WHERE email = ?", [email]);
        console.log(`Updated role to admin for user: ${email}`);

        const user = await db.get("SELECT * FROM users WHERE email = ?", [email]);
        console.log('User new status:', user);
    } catch (error) {
        console.error('Error updating user:', error);
    }
})();
