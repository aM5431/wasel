const HijriDate = require('hijri-date').default;

class FastingService {
    /**
     * Check if a specific date (or tomorrow) is a fasting day
     * @param {Date} date - The date to check (default: tomorrow)
     */
    static checkFastingDay(date = new Date()) {
        // We usually want to check for *tomorrow* to remind *today*
        const targetDate = new Date(date);
        targetDate.setDate(targetDate.getDate() + 1);

        const dayOfWeek = targetDate.getDay(); // 0 = Sunday, 1 = Monday, ..., 4 = Thursday

        const isMonday = dayOfWeek === 1;
        const isThursday = dayOfWeek === 4;

        // Hijri check
        // hijri-date lib usage: new HijriDate(date)
        const hijri = new HijriDate(targetDate);
        const hijriDay = hijri.getDate();

        // White days are 13, 14, 15
        const isWhiteDay = [13, 14, 15].includes(hijriDay);

        // Ashura (10th of Muharram - Month 1)
        const isAshura = (hijri.getMonth() === 1 && hijri.getDate() === 10);

        // Arafah (9th of Dhul Hijjah - Month 12)
        const isArafah = (hijri.getMonth() === 12 && hijri.getDate() === 9);

        return {
            date: targetDate,
            hijriDate: `${hijriDay}/${hijri.getMonth()}/${hijri.getFullYear()}`,
            isMonday,
            isThursday,
            isWhiteDay,
            isAshura,
            isArafah
        };
    }

    /**
     * Get the reminder message for the fasting type
     */
    static getReminderMessage(type) {
        const messages = {
            monday: "🌙 تذكير: غداً يوم الإثنين، سنة عن النبي ﷺ صيام هذا اليوم.",
            thursday: "🌙 تذكير: غداً يوم الخميس، ترفع فيه الأعمال، ويستحب الصيام فيه.",
            white_days: "🌕 تذكير: غداً من الأيام البيض، أوصى النبي ﷺ بصيامها.",
            ashura: "🌟 تذكير: غداً يوم عاشوراء، يكفر السنة الماضية.",
            arafah: "⛰️ تذكير: غداً يوم عرفة، صومه يكفر السنة الماضية والباقية."
        };
        return messages[type];
    }
}

module.exports = FastingService;
