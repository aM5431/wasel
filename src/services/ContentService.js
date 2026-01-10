const { db } = require('../database/db');
const { v4: uuidv4 } = require('uuid');

class ContentService {
    /**
     * Add new content to library
     */
    static async addContent(data) {
        const id = uuidv4();
        const { type, category, content_ar, source, media_url } = data;

        await db.run(
            `INSERT INTO content_library (id, type, category, content_ar, source, media_url) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [id, type, category, content_ar, source, media_url]
        );

        return await this.getContentById(id);
    }

    /**
     * Get content by ID
     */
    static async getContentById(id) {
        return await db.get('SELECT * FROM content_library WHERE id = ?', [id]);
    }

    /**
     * Get content by type and category (optional)
     */
    static async getContent(type, category = null) {
        let sql = 'SELECT * FROM content_library WHERE type = ? AND active = 1';
        let params = [type];

        if (category) {
            sql += ' AND category = ?';
            params.push(category);
        }

        return await db.all(sql, params);
    }

    /**
     * Get random content item
     */
    static async getAllContent(type, category = null) {
        let sql = 'SELECT * FROM content_library WHERE type = ? AND active = 1';
        const params = [type];

        if (category) {
            sql += ' AND category = ?';
            params.push(category);
        }

        // Order by ID or a sequence column if available
        sql += ' ORDER BY id ASC';

        return await db.all(sql, params);
    }

    static async getRandomContent(type, category = null) {
        let sql = 'SELECT * FROM content_library WHERE type = ? AND active = 1';
        const params = [type];

        if (category) {
            sql += ' AND category = ?';
            params.push(category);
        }

        // LRU Strategy: Order by last_sent_at ASC (NULLs first usually, or check DB specific)
        // SQLite: NULLs are considered smaller than any value? No, check.
        // Better: ORDER BY last_sent_at IS NOT NULL, last_sent_at ASC, RANDOM() LIMIT 1
        // This puts NULLs (never sent) first. Then oldest sent.
        sql += ' ORDER BY last_sent_at ASC NULLS FIRST, RANDOM() LIMIT 1';

        const content = await db.get(sql, params);

        // If we found content, we should mark it as sent? 
        // No, Scheduler should do it after successful send to ensure delivery.
        return content;
    }

    /**
     * Mark content as sent (update last_sent_at)
     */
    static async markContentAsSent(contentId) {
        await db.run(
            'UPDATE content_library SET last_sent_at = CURRENT_TIMESTAMP WHERE id = ?',
            [contentId]
        );
    }

    /**
     * Update content
     */
    static async updateContent(id, data) {
        const fields = [];
        const params = [];

        ['type', 'category', 'content_ar', 'source', 'media_url', 'active'].forEach(field => {
            if (data[field] !== undefined) {
                fields.push(`${field} = ?`);
                params.push(data[field]);
            }
        });

        if (fields.length === 0) return;

        params.push(id);
        await db.run(`UPDATE content_library SET ${fields.join(', ')} WHERE id = ?`, params);

        return await this.getContentById(id);
    }

    /**
     * Delete content
     */
    static async deleteContent(id) {
        await db.run('DELETE FROM content_library WHERE id = ?', [id]);
    }

    /**
     * Seed initial content if empty
     */
    static async seedInitialContent() {
        const count = await db.get('SELECT count(*) as count FROM content_library');
        if (count.count > 0) return;

        console.log('Seeding initial Islamic content...');

        const initialContent = [
            // Morning Adhkar
            { type: 'adhkar', category: 'morning', content_ar: 'أصبحنا وأصبح الملك لله، والحمد لله، لا إله إلا الله وحده لا شريك له.', source: 'صحيح مسلم' },
            { type: 'adhkar', category: 'morning', content_ar: 'اللهم بك أصبحنا وبك أمسينا وبك نحيا وبك نموت وإليك النشور.', source: 'الترمذي' },

            // Evening Adhkar
            { type: 'adhkar', category: 'evening', content_ar: 'أمسينا وأمسى الملك لله، والحمد لله، لا إله إلا الله وحده لا شريك له.', source: 'صحيح مسلم' },
            { type: 'adhkar', category: 'evening', content_ar: 'اللهم بك أمسينا وبك أصبحنا وبك نحيا وبك نموت وإليك المصير.', source: 'الترمذي' },

            // After Prayer Adhkar
            { type: 'adhkar', category: 'after_prayer', content_ar: 'أستغفر الله (ثلاثاً)، اللهم أنت السلام ومنك السلام، تباركت يا ذا الجلال والإكرام.', source: 'صحيح مسلم' },
            { type: 'adhkar', category: 'after_prayer', content_ar: 'لا إله إلا الله وحده لا شريك له، له الملك وله الحمد وهو على كل شيء قدير، اللهم لا مانع لما أعطيت، ولا معطي لما منعت، ولا ينفع ذا الجد منك الجد.', source: 'متفق عليه' },
            { type: 'adhkar', category: 'after_prayer', content_ar: 'لا إله إلا الله وحده لا شريك له، له الملك وله الحمد وهو على كل شيء قدير، لا حول ولا قوة إلا بالله، لا إله إلا الله، ولا نعبد إلا إياه، له النعمة وله الفضل وله الثناء الحسن، لا إله إلا الله مخلصين له الدين ولو كره الكافرون.', source: 'صحيح مسلم' },
            { type: 'adhkar', category: 'after_prayer', content_ar: 'سبحان الله (33 مرة)، الحمد لله (33 مرة)، الله أكبر (33 مرة)، ثم يتم المئة بقوله: لا إله إلا الله وحده لا شريك له، له الملك وله الحمد وهو على كل شيء قدير.', source: 'صحيح مسلم' },
            { type: 'adhkar', category: 'after_prayer', content_ar: 'قراءة آية الكرسي: {اللَّهُ لَا إِلَهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ...} [البقرة: 255].', source: 'النسائي (صححه الألباني)' },
            { type: 'adhkar', category: 'after_prayer', content_ar: 'قراءة المعوذات: {قل هو الله أحد}، {قل أعوذ برب الفلق}، {قل أعوذ برب الناس}. (مرة واحدة بعد الظهر والعصر والعشاء، وثلاثاً بعد الفجر والمغرب).', source: 'أبو داود والترمذي' },

            // General Adhkar
            { type: 'adhkar', category: 'general', content_ar: 'سبحان الله وبحمده، عدد خلقه، ورضا نفسه، وزنة عرشه، ومداد كلماته.', source: 'صحيح مسلم' },
            { type: 'adhkar', category: 'general', content_ar: 'لا حول ولا قوة إلا بالله العلي العظيم.', source: 'متفق عليه' },

            // Hadith
            { type: 'hadith', category: 'general', content_ar: 'قال رسول الله ﷺ: "من يرد الله به خيراً يفقهه في الدين".', source: 'متفق عليه' },
            { type: 'hadith', category: 'general', content_ar: 'قال رسول الله ﷺ: "إنما الأعمال بالنيات، وإنما لكل امرئ ما نوى".', source: 'البخاري' }
        ];

        for (const item of initialContent) {
            await this.addContent(item);
        }

        console.log(`✅ Seeded ${initialContent.length} content items.`);
    }
}

module.exports = ContentService;
