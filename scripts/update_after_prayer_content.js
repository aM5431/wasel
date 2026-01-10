const { db } = require('../src/database/db');
const { v4: uuidv4 } = require('uuid');

async function updateContent() {
    console.log('Updating After Prayer Adhkar content...');
    
    const newItems = [
        { type: 'adhkar', category: 'after_prayer', content_ar: 'لا إله إلا الله وحده لا شريك له، له الملك وله الحمد وهو على كل شيء قدير، اللهم لا مانع لما أعطيت، ولا معطي لما منعت، ولا ينفع ذا الجد منك الجد.', source: 'متفق عليه' },
        { type: 'adhkar', category: 'after_prayer', content_ar: 'لا إله إلا الله وحده لا شريك له، له الملك وله الحمد وهو على كل شيء قدير، لا حول ولا قوة إلا بالله، لا إله إلا الله، ولا نعبد إلا إياه، له النعمة وله الفضل وله الثناء الحسن، لا إله إلا الله مخلصين له الدين ولو كره الكافرون.', source: 'صحيح مسلم' },
        { type: 'adhkar', category: 'after_prayer', content_ar: 'سبحان الله (33 مرة)، الحمد لله (33 مرة)، الله أكبر (33 مرة)، ثم يتم المئة بقوله: لا إله إلا الله وحده لا شريك له، له الملك وله الحمد وهو على كل شيء قدير.', source: 'صحيح مسلم' },
        { type: 'adhkar', category: 'after_prayer', content_ar: 'قراءة آية الكرسي: {اللَّهُ لَا إِلَهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ...} [البقرة: 255].', source: 'النسائي (صححه الألباني)' },
        { type: 'adhkar', category: 'after_prayer', content_ar: 'قراءة المعوذات: {قل هو الله أحد}، {قل أعوذ برب الفلق}، {قل أعوذ برب الناس}. (مرة واحدة بعد الظهر والعصر والعشاء، وثلاثاً بعد الفجر والمغرب).', source: 'أبو داود والترمذي' }
    ];

    let addedCount = 0;
    for (const item of newItems) {
        // Check if exists
        const exists = await db.get('SELECT id FROM content_library WHERE content_ar = ?', [item.content_ar]);
        if (!exists) {
            await db.run(
                'INSERT INTO content_library (id, type, category, content_ar, source) VALUES (?, ?, ?, ?, ?)',
                [uuidv4(), item.type, item.category, item.content_ar, item.source]
            );
            addedCount++;
        }
    }

    console.log(`✅ Added ${addedCount} new items to content library.`);
    process.exit(0);
}

updateContent().catch(err => {
    console.error(err);
    process.exit(1);
});
