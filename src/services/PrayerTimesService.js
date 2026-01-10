const { db } = require('../database/db');
const { v4: uuidv4 } = require('uuid');
const { Coordinates, CalculationMethod, PrayerTimes } = require('adhan');
const moment = require('moment-timezone');

class PrayerTimesService {
    /**
     * Get cached prayer times or calculate fresh
     */
    static async getPrayerTimes(config) {
        let times = null;
        const date = new Date().toISOString().split('T')[0];
        let hijriDate = '';
        try {
            hijriDate = new Intl.DateTimeFormat('ar-SA-u-ca-islamic', {
                day: 'numeric', month: 'long', year: 'numeric'
            }).format(new Date());
        } catch (e) {
            console.error('Intl Hijri Error:', e.message);
            hijriDate = new Date().toLocaleDateString('ar-SA');
        }

        // Default base times
        times = {
            fajr: '05:00',
            sunrise: '06:30',
            dhuhr: '12:00',
            asr: '15:30',
            maghrib: '18:00',
            isha: '19:30',
            hijri_date: hijriDate,
            prayer_date: date,
            is_manual: true
        };

        if (!config.latitude && !config.longitude) {
            return times;
        }

        // Try to get automatic times if location is available
        if (config.latitude && config.longitude) {
            const locationKey = `${config.latitude}_${config.longitude}_${config.prayer_calculation_method || 'Egypt'}`;
            
            // Check cache
            let cached = await db.get(
                'SELECT * FROM prayer_times_cache WHERE location_key = ? AND prayer_date = ?',
                [locationKey, date]
            );

            if (!cached) {
                cached = await this.calculateAndCachePrayerTimes(config, date, locationKey);
            }

            if (cached) {
                times = { ...cached, is_manual: false };
            }
        }

        // If explicitly set to manual mode, apply manual overrides
        if (config.prayer_time_mode === 'manual') {
            console.log(`[PrayerTimesService-Debug] Applying manual overrides for config ${config.id}:`, {
                fajr: config.manual_fajr,
                dhuhr: config.manual_dhuhr,
                asr: config.manual_asr,
                maghrib: config.manual_maghrib,
                isha: config.manual_isha
            });
            if (config.manual_fajr) times.fajr = config.manual_fajr;
            if (config.manual_dhuhr) times.dhuhr = config.manual_dhuhr;
            if (config.manual_asr) times.asr = config.manual_asr;
            if (config.manual_maghrib) times.maghrib = config.manual_maghrib;
            if (config.manual_isha) times.isha = config.manual_isha;
            times.is_manual = true;
        }

        return times;
    }

    /**
     * Calculate using adhan library and cache
     */
    static async calculateAndCachePrayerTimes(config, date, locationKey) {
        try {
            const coordinates = new Coordinates(config.latitude, config.longitude);
            const dateObj = new Date(date);
            const timezone = config.timezone || 'Africa/Cairo';

            // Map method
            let calculationMethod = CalculationMethod.Egyptian();
            if (config.prayer_calculation_method === 'Makkah') calculationMethod = CalculationMethod.UmmAlQura();
            else if (config.prayer_calculation_method === 'MWL') calculationMethod = CalculationMethod.MuslimWorldLeague();
            else if (config.prayer_calculation_method === 'ISNA') calculationMethod = CalculationMethod.NorthAmerica();

            const prayerTimes = new PrayerTimes(coordinates, dateObj, calculationMethod);

            // Format times to HH:mm
            const formatter = (time) => moment(time).tz(timezone).format('HH:mm');

            // Get Hijri Date
            let hijriDate = '';
            try {
                hijriDate = new Intl.DateTimeFormat('ar-SA-u-ca-islamic', {
                    day: 'numeric', month: 'long', year: 'numeric'
                }).format(dateObj);
            } catch (e) {
                hijriDate = dateObj.toLocaleDateString('ar-SA');
            }

            const prayerData = {
                id: uuidv4(),
                location_key: locationKey,
                prayer_date: date,
                fajr: formatter(prayerTimes.fajr),
                sunrise: formatter(prayerTimes.sunrise),
                dhuhr: formatter(prayerTimes.dhuhr),
                asr: formatter(prayerTimes.asr),
                maghrib: formatter(prayerTimes.maghrib),
                isha: formatter(prayerTimes.isha),
                hijri_date: hijriDate,
                cached_at: new Date().toISOString()
            };

            await db.run(
                `INSERT INTO prayer_times_cache 
                (id, location_key, prayer_date, fajr, sunrise, dhuhr, asr, maghrib, isha, hijri_date, cached_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    prayerData.id, prayerData.location_key, prayerData.prayer_date,
                    prayerData.fajr, prayerData.sunrise, prayerData.dhuhr,
                    prayerData.asr, prayerData.maghrib, prayerData.isha,
                    prayerData.hijri_date, prayerData.cached_at
                ]
            );

            return prayerData;

        } catch (error) {
            console.error('Error calculating prayer times:', error.message);
            return null;
        }
    }

    /**
     * Get next prayer time
     */
    static async getNextPrayer(config) {
        const times = await this.getPrayerTimes(config);
        if (!times) return null;

        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();

        const prayers = [
            { name: 'fajr', time: times.fajr, nameAr: 'الفجر' },
            { name: 'dhuhr', time: times.dhuhr, nameAr: 'الظهر' },
            { name: 'asr', time: times.asr, nameAr: 'العصر' },
            { name: 'maghrib', time: times.maghrib, nameAr: 'المغرب' },
            { name: 'isha', time: times.isha, nameAr: 'العشاء' }
        ];

        for (const prayer of prayers) {
            const [hours, minutes] = prayer.time.split(':').map(Number);
            const prayerMinutes = hours * 60 + minutes;

            if (prayerMinutes > currentTime) {
                return {
                    name: prayer.name,
                    nameAr: prayer.nameAr,
                    time: prayer.time,
                    remainingMinutes: prayerMinutes - currentTime
                };
            }
        }

        // All prayers passed, return Fajr for tomorrow
        return {
            name: 'fajr',
            nameAr: 'الفجر',
            time: times.fajr,
            isTomorrow: true
        };
    }
}

module.exports = PrayerTimesService;
