const express = require('express');
const router = express.Router();
const HadithService = require('../services/HadithService');

const QuranService = require('../services/QuranService');
const IslamicBackgroundService = require('../services/IslamicBackgroundService');

// Hadith Routes
router.get('/books', async (req, res) => {
    try {
        const books = HadithService.getBooks();
        res.json(books);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/random', async (req, res) => {
    try {
        const { book } = req.query;
        const hadith = await HadithService.getRandomHadith(book);

        if (!hadith) {
            // Trigger refill if empty
            await HadithService.checkAndRefillCache();
            return res.status(404).json({ error: 'Cache initializing, please try again momentarily' });
        }
        res.json({
            id: hadith.id,
            text: hadith.content_ar,
            source: hadith.source,
            grade: hadith.fadl,
            raw: hadith
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/background', async (req, res) => {
    try {
        const source = String(req.query.source || 'quran_pages');
        const theme = String(req.query.theme || 'mosques');

        if (source === 'islamic_backgrounds' || source === 'curated') {
            const img = await IslamicBackgroundService.getBackground({ theme });
            if (img && img.url) {
                return res.json({
                    url: img.url,
                    source: img.source || 'صور مساجد احترافية',
                    meta: img.meta || null
                });
            }
        }

        const url = QuranService.getRandomPageImage();
        res.json({ url, source: 'صفحات القرآن (مصحف المدينة)' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/background-list', async (req, res) => {
    try {
        const theme = String(req.query.theme || 'mosques');
        const list = IslamicBackgroundService.getThemeList(theme) || [];
        res.json({
            theme,
            count: list.length,
            urls: list.map(x => x.url).filter(Boolean)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Quran Routes
router.get('/quran/juz/:id', async (req, res) => {
    try {
        const result = QuranService.getJuzImages(parseInt(req.params.id));
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
