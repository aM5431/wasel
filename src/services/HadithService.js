const axios = require('axios');
const { db } = require('../database/db'); // Access the main DB wrapper
const { v4: uuidv4 } = require('uuid');

class HadithService {
    constructor() {
        this.books = {
            bukhari: {
                id: 'ara-bukhari',
                baseUrl: 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/ara-bukhari',
                name: 'صحيح البخاري',
                sections: 97 // Approx number of sections
            },
            muslim: {
                id: 'ara-muslim',
                baseUrl: 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/ara-muslim',
                name: 'صحيح مسلم',
                sections: 56
            }
        };
        this.isFetching = false;
    }

    /**
     * Initialize service: Check DB cache and refill if empty with a small initial batch
     */
    async init() {
        console.log('📚 [HadithService] Initializing...');
        await this.checkAndRefillCache();

        // Schedule periodic refill (e.g., every 6 hours)
        setInterval(() => this.checkAndRefillCache(), 6 * 60 * 60 * 1000);
        console.log('✅ [HadithService] Ready.');
    }

    /**
     * Check if we have enough cached hadiths, if not, fetch more
     */
    async checkAndRefillCache() {
        if (this.isFetching) return;

        try {
            // Count existing cached hadiths
            const count = await this.getCachedCount();
            console.log(`📊 [HadithService] Cached hadiths: ${count}`);

            // If less than 50, fetch a new batch
            if (count < 50) {
                this.isFetching = true;
                await this.fetchBatch('bukhari');
                await this.fetchBatch('muslim');
                this.isFetching = false;
            }
        } catch (error) {
            console.error('❌ [HadithService] Cache check failed:', error.message);
            this.isFetching = false;
        }
    }

    async getCachedCount() {
        const row = await db.get("SELECT COUNT(*) as count FROM content_library WHERE type = 'hadith_cached'");
        return row ? row.count : 0;
    }

    /**
     * Fetch a random section from the API and save to DB
     */
    async fetchBatch(bookKey) {
        const book = this.books[bookKey];
        // Random section between 1 and max sections
        const sectionId = Math.floor(Math.random() * book.sections) + 1;
        const url = `${book.baseUrl}/sections/${sectionId}.json`;

        console.log(`⬇️ [HadithService] Fetching ${book.name} (Section ${sectionId})...`);

        try {
            const response = await axios.get(url);
            const hadiths = response.data.hadiths;

            if (!hadiths || !Array.isArray(hadiths)) return;

            // Save to DB
            let savedCount = 0;
            // Take random 10 from this section to avoid flooding
            const selected = hadiths.sort(() => 0.5 - Math.random()).slice(0, 10);

            for (const item of selected) {
                if (!item.text || item.text.length < 10) continue; // Skip empty/short

                const content = {
                    id: uuidv4(),
                    type: 'hadith_cached', // Special type for auto-cached content
                    category: 'hadith',
                    content_ar: this.cleanText(item.text),
                    source: `${book.name} - ${item.hadithnumber}`,
                    fadl: item.grades ? (item.grades[0]?.grade || 'صحيح') : 'صحيح'
                };

                // Insert into DB (ignore errors if duplicates logic was strict, but UUID prevents that)
                await this.saveToDb(content);
                savedCount++;
            }

            console.log(`💾 [HadithService] Saved ${savedCount} hadiths from ${book.name}.`);

        } catch (error) {
            console.error(`❌ [HadithService] Fetch batch failed for ${book.name}:`, error.message);
        }
    }

    stripSanad(text) {
        if (!text) return '';

        // Define common start markers for the actual Hadith text (Matn)
        const markers = [
            'أن رسول الله صلى الله عليه وسلم قال',
            'أن النبي صلى الله عليه وسلم قال',
            'يقول سمعت النبي صلى الله عليه وسلم يقول',
            'قال قال رسول الله صلى الله عليه وسلم',
            'عن النبي صلى الله عليه وسلم قال',
            'صلى الله عليه وسلم قال',
            'أن رسول الله قال',
            'سمعت النبي صلى الله عليه وسلم يقول'
        ];

        let cleanText = text;

        // Try to find the first occurrence of any marker
        let firstIndex = -1;
        let chosenMarker = '';

        for (const marker of markers) {
            const index = text.indexOf(marker);
            if (index !== -1 && (firstIndex === -1 || index < firstIndex)) {
                firstIndex = index;
                chosenMarker = marker;
            }
        }

        if (firstIndex !== -1) {
            // Take everything after the marker
            const afterMarker = text.substring(firstIndex + chosenMarker.length).trim();
            // Prefix with "قال رسول الله ﷺ: " for clarity
            cleanText = `قال رسول الله ﷺ: "${afterMarker}"`;
        } else {
            // Fallback: If no marker found, replace bulky mentions of "صلى الله عليه وسلم" with the symbol ﷺ
            cleanText = text.replace(/صلى الله عليه وسلم/g, 'ﷺ');
        }

        return cleanText;
    }

    cleanText(text) {
        if (!text) return '';

        // 1. Remove numbering (e.g. "1 -", "123 -")
        let cleaned = text.replace(/^\d+\s*[-]\s*/g, '');

        // 2. Remove [ ... ] brackets often containing extra notes
        cleaned = cleaned.replace(/\[.*?\]/g, '');

        // 3. Strip Sanad
        cleaned = this.stripSanad(cleaned);

        return cleaned.trim();
    }

    async saveToDb(content) {
        try {
            await db.run(
                `INSERT INTO content_library (id, type, category, content_ar, source, fadl) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [content.id, content.type, content.category, content.content_ar, content.source, content.fadl]
            );
        } catch (err) {
            // Ignore duplicates or other errors to continue loop
        }
    }

    /**
     * Get a random Hadith from the DB cache
     */
    async getRandomHadith(book = null) {
        if (book === 'bukhari') {
            const row = await db.get("SELECT * FROM content_library WHERE type = 'hadith_cached' AND source LIKE 'صحيح البخاري%' ORDER BY RANDOM() LIMIT 1");
            return row || null;
        }
        if (book === 'muslim') {
            const row = await db.get("SELECT * FROM content_library WHERE type = 'hadith_cached' AND source LIKE 'صحيح مسلم%' ORDER BY RANDOM() LIMIT 1");
            return row || null;
        }
        const row = await db.get("SELECT * FROM content_library WHERE type = 'hadith_cached' ORDER BY RANDOM() LIMIT 1");
        return row || null;
    }

    /**
     * Get available books list
     */
    getBooks() {
        return Object.values(this.books).map(b => ({ id: b.id, name: b.name }));
    }
}

module.exports = new HadithService();
