const axios = require('axios');

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

    static getRandomVideo() {
        // Curated short Islamic/Nature clips (Pexels/Pixabay - direct MP4 URLs)
        // These are public domian/free to use URLs.
        // For a real prod app, use Pexels API Key. For this demo, we can use a few sample clips.
        const videos = [
            'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4', // Cheerful/General
            'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4', // Nature/Fast
            'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4', // Nature/Water
            'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4' // Nature/Drive
            // Note: In production, user should host their own specific Islamic content clips on S3/Cloudinary
        ];
        return videos[Math.floor(Math.random() * videos.length)];
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
            // TODO: In a real app, use an API for Adhkar. For now, use fixed snippets based on category.
            const adhkarSnippets = {
                morning: [
                    "أصبـحـنا وأصبـح المـلك لله والحمد لله، لا إله إلا الله وحده لا شريك له.",
                    "اللهم بك أصبحنا وبك أمسينا وبك نحيا وبك نموت وإليك النشور.",
                    "سبحان الله وبحمده، عدد خلقه، ورضا نفسه، وزنة عرشه، ومداد كلماته."
                ],
                evening: [
                    "أمسـينا وأمسـى المـلك لله والحمد لله، لا إله إلا الله وحده لا شريك له.",
                    "اللهم بك أمسينا وبك أصبحنا وبك نحيا وبك نموت وإليك المصير.",
                    "أعوذ بكلمات الله التامات من شر ما خلق."
                ],
                general: [
                    "لا إله إلا الله وحد لا شريك له، له الملك وله الحمد وهو على كل شيء قدير.",
                    "سبحان الله وبحمده، سبحان الله العظيم."
                ]
            };
            const list = adhkarSnippets[category] || adhkarSnippets.general;
            contentText = list[Math.floor(Math.random() * list.length)];
            contentSource = (category === 'morning' ? 'أذكار الصباح' : (category === 'evening' ? 'أذكار المساء' : 'ذكر'));

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
            mediaUrl = this.getRandomVideo();
            mediaType = 'video';
        } else {
            mediaUrl = this.getRandomImage();
            mediaType = 'image';
        }

        return {
            type: type || 'hadith',
            content: contentText,
            source: contentSource,
            media_url: mediaUrl,
            media_type: mediaType
        };
    }
}

module.exports = ExternalContentService;
