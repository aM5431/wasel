const axios = require('axios');

class WikimediaImageService {
    static async getRandomIslamicImage() {
        const queries = [
            'incategory:"Mosques" filetype:bitmap',
            'incategory:"Islamic architecture" filetype:bitmap',
            'incategory:"Islamic geometric patterns" filetype:bitmap',
            'incategory:"Kaaba" filetype:bitmap',
            'incategory:"Al-Masjid an-Nabawi" filetype:bitmap',
            'incategory:"Al-Masjid al-Haram" filetype:bitmap'
        ];

        for (let attempt = 0; attempt < 4; attempt++) {
            const q = queries[Math.floor(Math.random() * queries.length)];
            const result = await this.searchCommonsImage(q);
            if (result) return result;
        }

        const fallback = await this.searchCommonsImage('incategory:"Mosques" filetype:bitmap');
        if (fallback) return fallback;

        return null;
    }

    static async searchCommonsImage(searchQuery) {
        const url = 'https://commons.wikimedia.org/w/api.php';
        const params = {
            action: 'query',
            format: 'json',
            generator: 'search',
            gsrsearch: searchQuery,
            gsrnamespace: 6,
            gsrlimit: 25,
            prop: 'imageinfo',
            iiprop: 'url|extmetadata',
            iiurlwidth: 1200,
            origin: '*'
        };

        let data;
        try {
            const res = await axios.get(url, { params, timeout: 7000 });
            data = res.data;
        } catch (e) {
            return null;
        }

        const pages = data?.query?.pages ? Object.values(data.query.pages) : [];
        if (!pages.length) return null;

        const candidates = pages
            .map(p => {
                const ii = p?.imageinfo?.[0];
                const imgUrl = ii?.thumburl || ii?.url;
                const ext = String(imgUrl || '').split('?')[0].split('.').pop()?.toLowerCase();
                if (!imgUrl || !ext || !['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return null;
                const meta = ii?.extmetadata || {};
                const license = meta?.LicenseShortName?.value || meta?.UsageTerms?.value || '';
                const artist = meta?.Artist?.value || '';
                const credit = meta?.Credit?.value || '';
                const pageUrl = meta?.ImageDescriptionUrl?.value || '';

                return {
                    url: imgUrl,
                    source: 'Wikimedia Commons',
                    attribution: {
                        page_url: pageUrl,
                        license,
                        artist,
                        credit
                    }
                };
            })
            .filter(Boolean);

        if (!candidates.length) return null;
        return candidates[Math.floor(Math.random() * candidates.length)];
    }
}

module.exports = WikimediaImageService;
