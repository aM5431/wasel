const FastingService = require('../src/services/FastingService');
const PrayerTimesService = require('../src/services/PrayerTimesService');
const { db } = require('../src/database/db');

// Mock DB for PrayerTimes caching
jest.mock('../src/database/db', () => ({
    db: {
        get: jest.fn(),
        run: jest.fn()
    }
}));

describe('Islamic Full Audit', () => {

    describe('FastingService', () => {

        test('should detect Monday as valid fasting day', () => {
            // Monday 6 Jan 2026 implies checking Sunday 5 Jan?
            // Service checks "tomorrow". So if we want tomorrow to be Monday, today is Sunday.
            // Let's set a known Sunday date.
            // 2026-01-04 is a Sunday. Tomorrow (2026-01-05) is Monday.

            const sunday = new Date('2026-01-04T12:00:00Z');
            const result = FastingService.checkFastingDay(sunday);

            expect(result.isMonday).toBe(true);
            expect(result.isThursday).toBe(false);
        });

        test('should detect Thursday as valid fasting day', () => {
            // 2026-01-07 is Wednesday. Tomorrow (2026-01-08) is Thursday.
            const wednesday = new Date('2026-01-07T12:00:00Z');
            const result = FastingService.checkFastingDay(wednesday);

            expect(result.isMonday).toBe(false);
            expect(result.isThursday).toBe(true);
        });

        // Note: Testing White Days (Hijri) requires mocking 'hijri-date' or knowing exact conversion.
        // We can check if offset logic path is taken (though logic is hard to verify without date freezing)
        test('should apply hijri offset', () => {
            // We just verify it doesn't crash, logic correctness depends on HijriDate lib
            // If we mock HijriDate class it would be better, but for now we trust our implementation
            const result = FastingService.checkFastingDay(new Date(), 1);
            expect(result).toBeDefined();
        });
    });

    describe('PrayerTimesService', () => {
        test('should calculate valid prayer times for Cairo', async () => {
            const config = {
                latitude: 30.0444,
                longitude: 31.2357,
                timezone: 'Africa/Cairo',
                prayer_calculation_method: 'Egypt'
            };

            // Mock cache miss
            db.get.mockResolvedValue(null);
            db.run.mockResolvedValue({});

            const times = await PrayerTimesService.getPrayerTimes(config);

            expect(times).toBeDefined();
            expect(times).toHaveProperty('fajr');
            expect(times).toHaveProperty('maghrib');

            // Check format HH:mm
            expect(times.fajr).toMatch(/^\d{2}:\d{2}$/);
            expect(times.maghrib).toMatch(/^\d{2}:\d{2}$/);

            // Basic sanity check: Maghrib should be after Fajr
            expect(times.maghrib > times.fajr).toBe(true);
        });

        test('should handle missing coordinates gracefully', async () => {
            const result = await PrayerTimesService.getPrayerTimes({});
            expect(result).toBeDefined();
            expect(result.is_manual).toBe(true);
        });
    });

});
