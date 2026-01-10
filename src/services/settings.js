const { db } = require('../database/db');

class SettingsService {
    static async get(key, defaultValue = null) {
        const row = await db.get('SELECT value FROM system_settings WHERE key = ?', [key]);
        if (row && row.value !== null && row.value !== undefined) {
            try {
                return JSON.parse(row.value);
            } catch (e) {
                console.warn(`Failed to parse JSON for key ${key}:`, e.message);
                return row.value;
            }
        }
        return defaultValue;
    }

    static async set(key, value) {
        const stringValue = typeof value === 'object' ? JSON.stringify(value) : value;
        return await db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [key, stringValue]);
    }

    static async initDefaults() {
        const landing = await this.get('landing_page');
        if (!landing) {
            await this.set('landing_page', {
                hero: {
                    title: "خدمة التذكير الإسلامي عبر واتساب",
                    subtitle: "صلاتك، أذكارك، ومواعيدك.. في رسالة واحدة.",
                    show: true
                },
                features: {
                    title: "مميزات منصة واصل الجديدة",
                    items: [
                        { title: "لوحة تحكم عصرية", desc: "واجهة مستخدم احترافية وسهلة الاستخدام مع دعم كامل للأجهزة المحمولة" },
                        { title: "مواقيت الصلاة والأذكار", desc: "تنبيهات دقيقة للصلاة، أذكار الصباح والمساء، وأذكار ما بعد الصلاة" },
                        { title: "القرآن والحديث", desc: "جدولة ورد يومي من القرآن الكريم وأحاديث صحيحة من البخاري ومسلم" },
                        { title: "أدوات إسلامية شاملة", desc: "منبه الصيام (الاثنين والخميس والأيام البيض)، والسبحة الإلكترونية" },
                        { title: "إدارة جلسات واتساب", desc: "ربط متعدد، مراقبة الحالة، وإعادة الاتصال التلقائي مع بوت للرد الآلي" }
                    ],
                    show: true
                },
                pricing: {
                    title: "باقات الاشتراك",
                    show: true
                },
                payment: {
                    vodafone_cash: {
                        enabled: true,
                        number: "01066284516",
                        instructions: "حول المبلغ إلى الرقم التالي"
                    },
                    instapay: {
                        enabled: true,
                        address: "aminkhaled@instapay",
                        phone: "01066284516",
                        instructions: "حول إلى عنوان الدفع (VPA) أو رقم الهاتف"
                    }
                }
            });
        }
    }
}

module.exports = SettingsService;
