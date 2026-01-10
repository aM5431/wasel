class AdhkarService {
    static ADHKAR = [
        {
            category: 'general',
            text: 'لا إله إلا الله وحده لا شريك له، له الملك وله الحمد، وهو على كل شيء قدير.',
            source: 'متفق عليه',
            source_url: 'https://www.islambook.com/azkar'
        },
        {
            category: 'istighfar',
            text: 'أستغفر الله العظيم وأتوب إليه.',
            source: 'ذكر',
            source_url: 'https://www.islambook.com/azkar'
        },
        {
            category: 'tasbeeh',
            text: 'سبحان الله.',
            source: 'ذكر',
            source_url: 'https://www.islambook.com/azkar'
        },
        {
            category: 'hamd',
            text: 'الحمد لله.',
            source: 'ذكر',
            source_url: 'https://www.islambook.com/azkar'
        },
        {
            category: 'tahleel',
            text: 'لا إله إلا الله.',
            source: 'ذكر',
            source_url: 'https://www.islambook.com/azkar'
        },
        {
            category: 'takbeer',
            text: 'الله أكبر.',
            source: 'ذكر',
            source_url: 'https://www.islambook.com/azkar'
        },
        {
            category: 'salat',
            text: 'اللهم صل وسلم وبارك على نبينا محمد.',
            source: 'ذكر',
            source_url: 'https://www.islambook.com/azkar'
        },
        {
            category: 'dua',
            text: 'ربنا آتنا في الدنيا حسنة وفي الآخرة حسنة وقنا عذاب النار.',
            source: 'قرآن (البقرة: 201)',
            source_url: 'https://quran.com/2/201'
        },
        {
            category: 'dua',
            text: 'اللهم إنك عفوٌ تحب العفو فاعفُ عني.',
            source: 'سنن الترمذي',
            source_url: 'https://dorar.net/hadith/sharh/23242'
        },
        {
            category: 'dua',
            text: 'اللهم إني أسألك الهدى والتقى والعفاف والغنى.',
            source: 'صحيح مسلم',
            source_url: 'https://dorar.net/hadith/sharh/106209'
        },
        {
            category: 'general',
            text: 'سبحان الله وبحمده، عدد خلقه، ورضا نفسه، وزنة عرشه، ومداد كلماته.',
            source: 'صحيح مسلم',
            source_url: 'https://dorar.net/hadith/sharh/106350'
        },
        {
            category: 'general',
            text: 'اللهم صل وسلم وبارك على نبينا محمد.',
            source: 'ذكر',
            source_url: 'https://www.islambook.com/azkar'
        },
        {
            category: 'morning',
            text: 'أصبحنا وأصبح الملك لله، والحمد لله، لا إله إلا الله وحده لا شريك له، له الملك وله الحمد وهو على كل شيء قدير، رب أسألك خير ما في هذا اليوم وخير ما بعده، وأعوذ بك من شر ما في هذا اليوم وشر ما بعده، رب أعوذ بك من الكسل وسوء الكبر، رب أعوذ بك من عذاب في النار وعذاب في القبر.',
            source: 'صحيح مسلم',
            source_url: 'https://www.islambook.com/azkar/1/%D8%A3%D8%B0%D9%83%D8%A7%D8%B1-%D8%A7%D9%84%D8%B5%D8%A8%D8%A7%D8%AD'
        },
        {
            category: 'morning',
            text: 'اللهم بك أصبحنا، وبك أمسينا، وبك نحيا، وبك نموت، وإليك النشور.',
            source: 'سنن الترمذي',
            source_url: 'https://dorar.net/hadith/sharh/144642'
        },
        {
            category: 'evening',
            text: 'أمسينا وأمسى الملك لله، والحمد لله، لا إله إلا الله وحده لا شريك له، له الملك وله الحمد وهو على كل شيء قدير، رب أسألك خير ما في هذه الليلة وخير ما بعدها، وأعوذ بك من شر ما في هذه الليلة وشر ما بعدها، رب أعوذ بك من الكسل وسوء الكبر، رب أعوذ بك من عذاب في النار وعذاب في القبر.',
            source: 'صحيح مسلم',
            source_url: 'https://www.islambook.com/azkar/2/%D8%A3%D8%B0%D9%83%D8%A7%D8%B1-%D8%A7%D9%84%D9%85%D8%B3%D8%A7%D8%A1'
        },
        {
            category: 'evening',
            text: 'اللهم بك أمسينا، وبك أصبحنا، وبك نحيا، وبك نموت، وإليك المصير.',
            source: 'سنن الترمذي',
            source_url: 'https://dorar.net/hadith/sharh/144638'
        }
    ];

    static async getRandomAdhkar(category = 'general') {
        const c = String(category || 'general').toLowerCase();
        const list = this.ADHKAR.filter(x => x.category === c);
        const pool = list.length ? list : this.ADHKAR;
        const item = pool.sort(() => 0.5 - Math.random())[0];
        return item ? { ...item } : null;
    }
}

module.exports = AdhkarService;
