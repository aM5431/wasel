const express = require('express');
const router = express.Router();
const IslamicBackgroundService = require('../services/IslamicBackgroundService');
const AdhkarService = require('../services/AdhkarService');

router.get('/random', async (req, res) => {
    try {
        const category = String(req.query.category || 'general').toLowerCase();
        const item = await AdhkarService.getRandomAdhkar(category);
        if (!item) return res.status(404).json({ error: 'No adhkar available' });

        res.json({
            category: item.category,
            text: item.text,
            source: item.source,
            source_url: item.source_url
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/background', async (req, res) => {
    try {
        const theme = String(req.query.theme || 'mosques');
        const img = await IslamicBackgroundService.getBackground({ theme });
        if (!img || !img.url) return res.status(404).json({ error: 'No background available' });
        res.json({ url: img.url, source: img.source || 'صور مساجد احترافية', meta: img.meta || null });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
