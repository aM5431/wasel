const fs = require('fs');
const path = require('path');
const axios = require('axios');

class HadithService {
    constructor() {
        this.cacheDir = path.join(__dirname, '..', 'data', 'hadiths');
        this.books = {
            bukhari: {
                id: 'ara-bukhari',
                url: 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/ara-bukhari.json',
                name: 'صحيح البخاري'
            },
            muslim: {
                id: 'ara-muslim',
                url: 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/ara-muslim.json',
                name: 'صحيح مسلم'
            }
        };
        this.cache = {}; // In-memory cache
    }

    /**
     * Initialize service: Ensure cache dir exists and load data
     */
    async init() {
        try {
            if (!fs.existsSync(this.cacheDir)) {
                fs.mkdirSync(this.cacheDir, { recursive: true });
            }

            console.log('📚 [HadithService] Initializing...');

            // Load or fetch books
            await this.loadBook('bukhari');
            await this.loadBook('muslim');

            console.log('✅ [HadithService] Ready.');
        } catch (error) {
            console.error('❌ [HadithService] Init failed:', error.message);
        }
    }

    /**
     * Load book from local cache or download if missing
     */
    async loadBook(bookKey) {
        const book = this.books[bookKey];
        const filePath = path.join(this.cacheDir, `${book.id}.json`);

        if (fs.existsSync(filePath)) {
            // Load from disk
            console.log(`📄 [HadithService] Loading ${book.name} from cache...`);
            const rawData = fs.readFileSync(filePath, 'utf-8');
            this.cache[bookKey] = JSON.parse(rawData);
        } else {
            // Download
            console.log(`⬇️ [HadithService] Downloading ${book.name}...`);
            const response = await axios.get(book.url);
            this.cache[bookKey] = response.data;
            // Save to disk
            fs.writeFileSync(filePath, JSON.stringify(response.data, null, 2));
            console.log(`💾 [HadithService] Saved ${book.name} to cache.`);
        }
    }

    /**
     * Get a random Hadith from loaded books
     */
    getRandomHadith(bookKey = 'bukhari') {
        const data = this.cache[bookKey];
        if (!data || !data.hadiths) return null;

        const hadiths = data.hadiths;
        const randomItem = hadiths[Math.floor(Math.random() * hadiths.length)];

        // Helper to clean text if needed (sometimes contains numbers or specific chars)
        let text = randomItem.text;

        return {
            text: text,
            source: this.books[bookKey].name,
            number: randomItem.hadithnumber,
            grade: randomItem.grades ? randomItem.grades[0]?.grade : 'صحيح'
        };
    }

    /**
     * Get available books list
     */
    getBooks() {
        return Object.values(this.books).map(b => ({ id: b.id, name: b.name }));
    }
}

module.exports = new HadithService();
