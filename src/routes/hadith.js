const express = require('express');
const router = express.Router();
const HadithService = require('../services/HadithService');

const QuranService = require('../services/QuranService');

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
        const hadith = HadithService.getRandomHadith(book || 'bukhari');
        if (!hadith) {
            return res.status(404).json({ error: 'No hadith found or cache empty' });
        }
        res.json(hadith);
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
