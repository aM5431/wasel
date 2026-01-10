class QuranService {
    constructor() {
        // Mapping of Juz to Start Page (Madani Mushaf)
        this.juzStartPages = {
            1: 1, 2: 22, 3: 42, 4: 62, 5: 82, 6: 102, 7: 122, 8: 142, 9: 162, 10: 182,
            11: 202, 12: 222, 13: 242, 14: 262, 15: 282, 16: 302, 17: 322, 18: 342, 19: 362, 20: 382,
            21: 402, 22: 422, 23: 442, 24: 462, 25: 482, 26: 502, 27: 522, 28: 542, 29: 562, 30: 582
        };
        // Total pages: 604
    }

    /**
     * Get image URLs for a specific Juz
     * @param {number} juzNumber (1-30)
     * @returns {string[]} Array of image URLs
     */
    getJuzImages(juzNumber) {
        if (juzNumber < 1 || juzNumber > 30) {
            throw new Error('Invalid Juz number (1-30)');
        }

        const startPage = this.juzStartPages[juzNumber];
        const nextJuzStart = this.juzStartPages[juzNumber + 1] || 605;
        const endPage = nextJuzStart - 1;

        const imageUrls = [];
        // Using a reliable GitHub raw source for Quran pages (Madani)
        for (let page = startPage; page <= endPage; page++) {
            // Source: https://github.com/Five-Prayers/quran-pages (Public Repo)
            imageUrls.push(`https://raw.githubusercontent.com/Five-Prayers/quran-pages/main/quran_pages/${page}.png`);
        }

        return {
            juz: juzNumber,
            startPage,
            endPage,
            images: imageUrls
        };
    }

    getRandomPageImage() {
        const page = Math.floor(Math.random() * 604) + 1;
        return `https://raw.githubusercontent.com/Five-Prayers/quran-pages/main/quran_pages/${page}.png`;
    }
}

module.exports = new QuranService();
