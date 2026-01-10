const axios = require('axios');

class IslamicVideoService {
    static cache = new Map();

    static QUERIES = [
        'mosque',
        'islamic',
        'quran',
        'prayer',
        'adhan',
        'kaaba'
    ];

    static getRandomQuery() {
        return this.QUERIES[Math.floor(Math.random() * this.QUERIES.length)];
    }

    static async getFromPexels() {
        const key = process.env.PEXELS_API_KEY;
        if (!key) return null;

        const q = this.getRandomQuery();
        const cacheKey = `pexels:${q}`;
        const cached = this.cache.get(cacheKey);
        if (cached && (Date.now() - cached.at) < 10 * 60 * 1000) return cached.url;

        const res = await axios.get('https://api.pexels.com/videos/search', {
            headers: { Authorization: key },
            params: { query: q, per_page: 20, orientation: 'portrait' }
        });

        const videos = Array.isArray(res.data?.videos) ? res.data.videos : [];
        const candidates = [];
        for (const v of videos) {
            const files = Array.isArray(v?.video_files) ? v.video_files : [];
            for (const f of files) {
                const link = String(f?.link || '');
                const w = Number(f?.width || 0);
                const size = Number(f?.file_size || 0);
                const quality = String(f?.quality || '');
                if (!link.startsWith('https://')) continue;
                if (!link.toLowerCase().includes('.mp4')) continue;
                if (quality && quality !== 'sd' && quality !== 'hd') continue;
                if (w && w > 720) continue;
                if (size && size > 14 * 1024 * 1024) continue;
                candidates.push({ link, w, size });
            }
        }

        const picked = candidates.sort(() => 0.5 - Math.random())[0]?.link || null;
        if (picked) this.cache.set(cacheKey, { at: Date.now(), url: picked });
        return picked;
    }

    static async getFromPixabay() {
        const key = process.env.PIXABAY_API_KEY;
        if (!key) return null;

        const q = this.getRandomQuery();
        const cacheKey = `pixabay:${q}`;
        const cached = this.cache.get(cacheKey);
        if (cached && (Date.now() - cached.at) < 10 * 60 * 1000) return cached.url;

        const res = await axios.get('https://pixabay.com/api/videos/', {
            params: {
                key,
                q,
                safesearch: 'true',
                per_page: 50
            }
        });

        const hits = Array.isArray(res.data?.hits) ? res.data.hits : [];
        const candidates = [];
        for (const h of hits) {
            const v = h?.videos || {};
            const preferred = v.medium || v.small || v.large || null;
            const url = String(preferred?.url || '');
            if (!url.startsWith('https://')) continue;
            if (!url.toLowerCase().includes('.mp4')) continue;
            candidates.push(url);
        }

        const picked = candidates.sort(() => 0.5 - Math.random())[0] || null;
        if (picked) this.cache.set(cacheKey, { at: Date.now(), url: picked });
        return picked;
    }

    static getFallbackCurated() {
        const videos = [
            'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
            'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4'
        ];
        return videos[Math.floor(Math.random() * videos.length)];
    }

    static async getIslamicVideoUrl() {
        try {
            const pexels = await this.getFromPexels();
            if (pexels) return pexels;
        } catch (e) { }
        try {
            const pixabay = await this.getFromPixabay();
            if (pixabay) return pixabay;
        } catch (e) { }
        return this.getFallbackCurated();
    }
}

module.exports = IslamicVideoService;

