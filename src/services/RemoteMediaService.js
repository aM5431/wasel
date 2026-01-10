const axios = require('axios');

class RemoteMediaService {
    static USER_AGENT = 'WaselMediaFetcher/1.0 (https://localhost; contact: admin@wasel.local)';

    static async fetchImageBuffer(url) {
        if (!url || typeof url !== 'string') return null;

        try {
            const res = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 20000,
                maxRedirects: 5,
                validateStatus: () => true,
                headers: {
                    'User-Agent': this.USER_AGENT
                }
            });

            if (res.status < 200 || res.status >= 400) return null;
            const contentType = String(res.headers?.['content-type'] || '');
            if (!contentType.startsWith('image/')) return null;

            return Buffer.from(res.data);
        } catch (e) {
            return null;
        }
    }

    static async isImageUrlReachable(url) {
        try {
            const res = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 12000,
                maxRedirects: 5,
                validateStatus: () => true,
                headers: {
                    'User-Agent': this.USER_AGENT,
                    Range: 'bytes=0-0'
                }
            });

            if (res.status < 200 || res.status >= 400) return false;
            const contentType = String(res.headers?.['content-type'] || '');
            return contentType.startsWith('image/');
        } catch (e) {
            return false;
        }
    }
}

module.exports = RemoteMediaService;
