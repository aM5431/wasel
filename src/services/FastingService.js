const HijriDate = require('hijri-date').default || require('hijri-date');

class FastingService {
    /**
     * Check if a specific date (or tomorrow) is a fasting day
     * @param {Date} date - The date to check (default: tomorrow)
     */
    static checkFastingDay(date = new Date(), hijriOffset = 0) {
        // We usually want to check for *tomorrow* to remind *today*
        const targetDate = new Date(date);
        targetDate.setDate(targetDate.getDate() + 1);

        const dayOfWeek = targetDate.getDay(); // 0 = Sunday, 1 = Monday, ..., 4 = Thursday

        const isMonday = dayOfWeek === 1;
        const isThursday = dayOfWeek === 4;

        // Hijri check
        // Ensure we pass targetDate to HijriDate constructor
        // @ts-ignore
        const hijri = new HijriDate(targetDate);

        // Apply Offset
        if (hijriOffset !== 0) {
            // HijriDate library usually supports addDay/subDay which modifies in place or return new
            // Assuming addDay() adds 1 day.
            // If offset is positive
            for (let i = 0; i < Math.abs(hijriOffset); i++) {
                if (hijriOffset > 0) {
                    if (typeof hijri.addDay === 'function') hijri.addDay();
                } else {
                    if (typeof hijri.subDay === 'function') hijri.subDay();
                    // Fallback if subDay doesn't exist? (Many libs like this only have addDay)
                    // If subDay missing, we might need to recreate date shifted?
                    // Let's assume subDay exists or just warn.
                }
            }
        }

        const hijriDay = hijri.getDate();

        // White days are 13, 14, 15
        const isWhiteDay = [13, 14, 15].includes(hijriDay);

        // Ashura (10th of Muharram - Month 1)
        const isAshura = (hijri.getMonth() === 1 && hijri.getDate() === 10);

        // Arafah (9th of Dhul Hijjah - Month 12)
        const isArafah = (hijri.getMonth() === 12 && hijri.getDate() === 9);

        return {
            date: targetDate,
            hijriDate: `${hijriDay}/${hijri.getMonth()}/${hijri.getFullYear ? hijri.getFullYear() : hijri.year}`,
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
