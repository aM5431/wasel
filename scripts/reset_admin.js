const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

const dbPath = path.join(__dirname, '../src/database/app.db');
const db = new sqlite3.Database(dbPath);

(async () => {
    try {
        const email = 'amin01066284516@gmail.com';
        const password = 'password123';
        const hashedPassword = await bcrypt.hash(password, 10);

        db.serialize(() => {
            // Check if user exists
            db.get("SELECT id FROM users WHERE email = ?", [email], (err, row) => {
                if (err) {
                    console.error("Error checking user:", err);
                    return;
                }

                if (row) {
                    // Update existing user
                    db.run("UPDATE users SET password_hash = ?, role = 'admin' WHERE email = ?", [hashedPassword, email], (err) => {
                        if (err) console.error("Error updating user:", err);
                        else console.log(`Updated password and role for: ${email}`);
                    });
                } else {
                    // Create new user if not exists
                    const id = require('crypto').randomUUID();
                    db.run("INSERT INTO users (id, name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?, 'admin')",
                        [id, 'Admin User', email, '01066284516', hashedPassword],
                        (err) => {
                            if (err) console.error("Error inserting user:", err);
                            else console.log(`Created new admin user: ${email}`);
                        }
                    );
                }
            });
        });

        // Wait a bit for async DB ops
        setTimeout(() => db.close(), 1000);

    } catch (error) {
        console.error('Script error:', error);
    }
})();
