const axios = require('axios');
const RemoteMediaService = require('./RemoteMediaService');

class IslamicBackgroundService {
    static cache = new Map();

    static async getBackground({ theme = 'mixed', excludeUrls = [] } = {}) {
        const exclude = new Set(Array.isArray(excludeUrls) ? excludeUrls.filter(Boolean) : []);
        const fullList = this.getThemeList(theme);
        const list = fullList.filter(x => x?.url && !exclude.has(x.url));
        const shuffled = (list.length ? list : fullList).slice().sort(() => 0.5 - Math.random());

        for (const item of shuffled) {
            if (!item?.url) continue;
            const ok = await this.isUrlOk(item.url);
            if (!ok) continue;
            return {
                url: item.url,
                source: item.source || 'خلفيات إسلامية ثابتة',
                meta: item.meta || null
            };
        }

        return null;
    }

    static getThemeList(theme) {
        const themes = {
            mosques: this.MOSQUES,
            quran: this.QURAN,
            patterns: this.PATTERNS
        };

        if (theme && themes[theme] && themes[theme].length) return themes[theme];
        if (this.QURAN.length) return this.QURAN;
        return [...this.MOSQUES, ...this.QURAN, ...this.PATTERNS];
    }

    static async isUrlOk(url) {
        const cached = this.cache.get(url);
        const now = Date.now();
        if (cached && now - cached.checkedAt < 6 * 60 * 60 * 1000) {
            return cached.ok;
        }

        const ok = await RemoteMediaService.isImageUrlReachable(url);

        this.cache.set(url, { ok, checkedAt: now });
        return ok;
    }

    static MOSQUES = [
        { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/Bohoniki_meczet_5.jpg/1920px-Bohoniki_meczet_5.jpg', source: 'Wikimedia Commons (صور مساجد احترافية)', meta: { theme: 'mosques' } },
        { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/Arc_design_National_Mosque_of_Ghana.jpg/1920px-Arc_design_National_Mosque_of_Ghana.jpg', source: 'Wikimedia Commons (صور مساجد احترافية)', meta: { theme: 'mosques' } },
        { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Mosque_in_Yrdyk_02.jpg/1920px-Mosque_in_Yrdyk_02.jpg', source: 'Wikimedia Commons (صور مساجد احترافية)', meta: { theme: 'mosques' } },

        { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/Masjid_Nurul_iman.jpg/1920px-Masjid_Nurul_iman.jpg', source: 'Wikimedia Commons (صور مساجد احترافية)', meta: { theme: 'mosques' } },
        { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/ALWaledain_Grand_Mosque.jpg/1920px-ALWaledain_Grand_Mosque.jpg', source: 'Wikimedia Commons (صور مساجد احترافية)', meta: { theme: 'mosques' } },
        { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/Blua_moskeo_en_Erevano_27.jpg/1920px-Blua_moskeo_en_Erevano_27.jpg', source: 'Wikimedia Commons (صور مساجد احترافية)', meta: { theme: 'mosques' } },

        { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/2011_Prizren%2C_Meczet_Sinana_Paszy_09.JPG/1920px-2011_Prizren%2C_Meczet_Sinana_Paszy_09.JPG', source: 'Wikimedia Commons (صور مساجد احترافية)', meta: { theme: 'mosques' } },
        { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/70/2011_Prizren%2C_Meczet_Sinana_Paszy_11.JPG/1920px-2011_Prizren%2C_Meczet_Sinana_Paszy_11.JPG', source: 'Wikimedia Commons (صور مساجد احترافية)', meta: { theme: 'mosques' } },

        { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Interior_masjid_jami_inuman.jpg/3840px-Interior_masjid_jami_inuman.jpg', source: 'Wikimedia Commons (صور مساجد احترافية)', meta: { theme: 'mosques' } },
        { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Mosqu%C3%A9e_Kouba_Int%C3%A9rieur.jpg/3840px-Mosqu%C3%A9e_Kouba_Int%C3%A9rieur.jpg', source: 'Wikimedia Commons (صور مساجد احترافية)', meta: { theme: 'mosques' } },
        { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/93/Baiturrahman_Mosque_dome_Temukus.jpg/1920px-Baiturrahman_Mosque_dome_Temukus.jpg', source: 'Wikimedia Commons (صور مساجد احترافية)', meta: { theme: 'mosques' } },

        { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/Masjid_Nurul_iman.jpg/3840px-Masjid_Nurul_iman.jpg', source: 'Wikimedia Commons (صور مساجد احترافية)', meta: { theme: 'mosques' } },
        { url: 'https://upload.wikimedia.org/wikipedia/commons/c/c7/The_Great_Mosque_in_Prishtina.JPG', source: 'Wikimedia Commons (صور مساجد احترافية)', meta: { theme: 'mosques' } },

        { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/51/Mosque_in_Yrdyk_03.jpg/1920px-Mosque_in_Yrdyk_03.jpg', source: 'Wikimedia Commons (صور مساجد احترافية)', meta: { theme: 'mosques' } },
        { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/ALWaledain_Grand_Mosque.jpg/3840px-ALWaledain_Grand_Mosque.jpg', source: 'Wikimedia Commons (صور مساجد احترافية)', meta: { theme: 'mosques' } },
        { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/93/Baiturrahman_Mosque_dome_Temukus.jpg/3840px-Baiturrahman_Mosque_dome_Temukus.jpg', source: 'Wikimedia Commons (صور مساجد احترافية)', meta: { theme: 'mosques' } },
        { url: 'https://upload.wikimedia.org/wikipedia/commons/3/3d/Abbas-Mirza-Mosque.jpg', source: 'Wikimedia Commons (صور مساجد احترافية)', meta: { theme: 'mosques' } },

        { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Bohoniki_meczet_6.jpg/1920px-Bohoniki_meczet_6.jpg', source: 'Wikimedia Commons (صور مساجد احترافية)', meta: { theme: 'mosques' } },
        { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/df/Shkoder_128.JPG/3840px-Shkoder_128.JPG', source: 'Wikimedia Commons (صور مساجد احترافية)', meta: { theme: 'mosques' } },
        { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/SkodraEbu-Bekr-MoscheeInnen2014.JPG/3840px-SkodraEbu-Bekr-MoscheeInnen2014.JPG', source: 'Wikimedia Commons (صور مساجد احترافية)', meta: { theme: 'mosques' } },
        { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Mehrab_of_Masjed_e_Mufti_-_Azam.JPG/1920px-Mehrab_of_Masjed_e_Mufti_-_Azam.JPG', source: 'Wikimedia Commons (صور مساجد احترافية)', meta: { theme: 'mosques' } },

        { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/Sultan_Abdul_Samad_Jamek_Mosque_-_interior_%281%29.jpg/3840px-Sultan_Abdul_Samad_Jamek_Mosque_-_interior_%281%29.jpg', source: 'Wikimedia Commons (صور مساجد احترافية)', meta: { theme: 'mosques' } },
        { url: 'https://upload.wikimedia.org/wikipedia/commons/0/02/Preston_mosque.jpg', source: 'Wikimedia Commons (صور مساجد احترافية)', meta: { theme: 'mosques' } },

        { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/Eupatoria%2C_Juma-Jami_Mosque%2C_Minbar%2C_Mihrab%2C_Crimea.jpg/1920px-Eupatoria%2C_Juma-Jami_Mosque%2C_Minbar%2C_Mihrab%2C_Crimea.jpg', source: 'Wikimedia Commons (صور مساجد احترافية)', meta: { theme: 'mosques' } },
        { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Mihrab_de_la_mesquita_de_la_Xara%2C_Simat_de_la_Valldigna.jpg/1920px-Mihrab_de_la_mesquita_de_la_Xara%2C_Simat_de_la_Valldigna.jpg', source: 'Wikimedia Commons (صور مساجد احترافية)', meta: { theme: 'mosques' } },
        { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Tokyo_Camii_mihrab.JPG/1920px-Tokyo_Camii_mihrab.JPG', source: 'Wikimedia Commons (صور مساجد احترافية)', meta: { theme: 'mosques' } },
        { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/MMIC_Mihrab.jpg/2048px-MMIC_Mihrab.jpg', source: 'Wikimedia Commons (صور مساجد احترافية)', meta: { theme: 'mosques' } },
        { url: 'https://upload.wikimedia.org/wikipedia/commons/6/6c/Mihrab%2C_Al-Rahma_Mosque_-_geograph.org.uk_-_7937045.jpg', source: 'Wikimedia Commons (صور مساجد احترافية)', meta: { theme: 'mosques' } },
        { url: 'https://upload.wikimedia.org/wikipedia/commons/a/ac/Suakin%2CSchafia_mihrab.jpg', source: 'Wikimedia Commons (صور مساجد احترافية)', meta: { theme: 'mosques' } },
        { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/State_Mosque_Mihrab.jpg/1920px-State_Mosque_Mihrab.jpg', source: 'Wikimedia Commons (صور مساجد احترافية)', meta: { theme: 'mosques' } }
    ];

    static QURAN = [];

    static PATTERNS = [];
}

module.exports = IslamicBackgroundService;
