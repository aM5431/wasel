const { db } = require('../database/db');

class AuditService {
    /**
     * Log an activity
     * @param {string|number} userId - The ID of the user performing the action
     * @param {string} action - Short action code (e.g., 'LOGIN', 'APPROVE_PAYMENT')
     * @param {object|string} details - Additional details about the action
     * @param {object} req - Express request object (optional, to capture IP/UserAgent)
     */
    static async log(userId, action, details, req = null) {
        try {
            const ip = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress) : null;
            const ua = req ? req.headers['user-agent'] : null;
            const detailsStr = typeof details === 'object' ? JSON.stringify(details) : details;

            await db.run(
                'INSERT INTO activity_logs (user_id, action, details, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)',
                [userId, action, detailsStr, ip, ua]
            );
            console.log(`[Audit] ${action} by User ${userId}`);
        } catch (error) {
            console.error('Failed to log activity:', error);
            // Don't throw, we don't want to break the main flow if logging fails
        }
    }

    /**
     * Get recent logs
     * @param {number} limit 
     * @param {number} offset 
     */
    static async getLogs(limit = 50, offset = 0) {
        return await db.all(`
            SELECT l.*, u.name as user_name, u.email as user_email
            FROM activity_logs l
            LEFT JOIN users u ON l.user_id = u.id
            ORDER BY l.created_at DESC
            LIMIT ? OFFSET ?
        `, [limit, offset]);
    }
}

module.exports = AuditService;
