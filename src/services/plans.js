const { db } = require('../database/db');

class PlanService {
    static async getAll() {
        return await db.all('SELECT * FROM plans ORDER BY price ASC');
    }
}

module.exports = PlanService;
