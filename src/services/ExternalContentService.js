const axios = require('axios');
const IslamicVideoService = require('./IslamicVideoService');

class ExternalContentService {

    static async getRandomHadith() {
        try {
            // Using random-hadith-generator (Bukhari)
            const response = await axios.get('https://random-hadith-generator.vercel.app/bukhari/');
            if (response.data && response.data.data) {
                return {
                    text_ar: response.data.data.hadith_arabic || response.data.data.hadith_urdu,
                    source: 'صحيح البخاري'
                };
            }
            return null;
        } catch (error) {
            console.error('Error fetching external hadith:', error.message);
            return null;
        }
    }

    static getRandomImage() {
        // High quality Islamic/Nature backgrounds (Unsplash Source - direct URLs)
        const images = [
            'https://images.unsplash.com/photo-1596417469794-811c751a0279?auto=format&fit=crop&w=1080&q=80', // Beautiful Mosque
            'https://images.unsplash.com/photo-1584551246679-0daf3d275d0f?auto=format&fit=crop&w=1080&q=80', // Mosque Interior
            'https://images.unsplash.com/photo-1519817650390-64a93db51149?auto=format&fit=crop&w=1080&q=80', // Architecture
            'https://images.unsplash.com/photo-1579218698188-466c1b3f6831?auto=format&fit=crop&w=1080&q=80', // Quran
            'https://images.unsplash.com/photo-1564121211835-e88c852648ab?auto=format&fit=crop&w=1080&q=80', // Blue Mosque
            'https://images.unsplash.com/photo-1534960680480-cca9853322bc?auto=format&fit=crop&w=1080&q=80', // Lantern
            'https://images.unsplash.com/photo-1580418827493-f2b22c4f7ceb?auto=format&fit=crop&w=1080&q=80', // Pattern
            'https://images.unsplash.com/photo-1596700813735-d8aa40536c0a?auto=format&fit=crop&w=1080&q=80'  // Kaaba
        ];
        return images[Math.floor(Math.random() * images.length)];
    }

    static getRandomIslamicBackgroundImage() {
        return this.getRandomImage();
    }

    static async getRandomVideo() {
        return await IslamicVideoService.getIslamicVideoUrl();
    }

    static async getDailyContent(preference = 'mixed', type = 'general', category = 'general') {
        // Preference: 'image', 'video', 'mixed'
        let useVideo = false;

        if (preference === 'video') {
            useVideo = true;
        } else if (preference === 'image') {
            useVideo = false;
        } else {
            // Mixed: 20% video, 80% image
            useVideo = Math.random() > 0.8;
        }

        let contentText = null;
        let contentSource = null;

        // Fetch context-aware content
        if (type === 'adhkar') {
            const adhkarSnippets = {
                morning: [
                    { content: "أصبحنا وأصبح الملك لله، والحمد لله، لا إله إلا الله وحده لا شريك له، له الملك وله الحمد وهو على كل شيء قدير، رب أسألك خير ما في هذا اليوم وخير ما بعده، وأعوذ بك من شر ما في هذا اليوم وشر ما بعده، رب أعوذ بك من الكسل وسوء الكبر، رب أعوذ بك من عذاب في النار وعذاب في القبر.", source: "صحيح مسلم" },
                    { content: "اللهم بك أصبحنا، وبك أمسينا، وبك نحيا، وبك نموت، وإليك النشور.", source: "سنن الترمذي" },
                    { content: "اللهم أنت ربي لا إله إلا أنت، خلقتني وأنا عبدك، وأنا على عهدك ووعدك ما استطعت، أعوذ بك من شر ما صنعت، أبوء لك بنعمتك علي، وأبوء بذنبي فاغفر لي فإنه لا يغفر الذنوب إلا أنت.", source: "صحيح البخاري (سيد الاستغفار)" }
                ],
                evening: [
                    { content: "أمسينا وأمسى الملك لله، والحمد لله، لا إله إلا الله وحده لا شريك له، له الملك وله الحمد وهو على كل شيء قدير، رب أسألك خير ما في هذه الليلة وخير ما بعدها، وأعوذ بك من شر ما في هذه الليلة وشر ما بعدها، رب أعوذ بك من الكسل وسوء الكبر، رب أعوذ بك من عذاب في النار وعذاب في القبر.", source: "صحيح مسلم" },
                    { content: "اللهم بك أمسينا، وبك أصبحنا، وبك نحيا، وبك نموت، وإليك المصير.", source: "سنن الترمذي" },
                    { content: "أعوذ بكلمات الله التامات من شر ما خلق.", source: "صحيح مسلم" }
                ],
                general: [
                    { content: "لا إله إلا الله وحده لا شريك له، له الملك وله الحمد، وهو على كل شيء قدير.", source: "متفق عليه" },
                    { content: "سبحان الله وبحمده، عدد خلقه، ورضا نفسه، وزنة عرشه، ومداد كلماته.", source: "صحيح مسلم" },
                    { content: "اللهم صل وسلم وبارك على نبينا محمد.", source: "ذكر" }
                ]
            };
            const list = adhkarSnippets[category] || adhkarSnippets.general;
            const item = list[Math.floor(Math.random() * list.length)];
            contentText = item.content;
            contentSource = item.source;
        } else {
            // Default: Random Hadith
            const hadith = await this.getRandomHadith();
            if (hadith) {
                contentText = hadith.text_ar;
                contentSource = hadith.source;
            }
        }

        if (!contentText) {
            contentText = 'سبحان الله وبحمده 🌿';
            contentSource = 'ذكر';
        }

        let mediaUrl = null;
        let mediaType = 'image';

        if (useVideo) {
            mediaUrl = await this.getRandomVideo();
            mediaType = 'video';
        } else {
            mediaUrl = this.getRandomImage();
            mediaType = 'image';
        }

        let finalType = type;
        if (!type || type === 'general') {
             if (contentSource === 'ذكر' || (contentText && contentText.includes('سبحان الله'))) {
                 finalType = 'adhkar';
             } else {
                 finalType = 'hadith';
             }
        }

        return {
            type: finalType,
            content: contentText,
            source: contentSource,
            media_url: mediaUrl,
            media_type: mediaType
        };
    }
}

module.exports = ExternalContentService;
