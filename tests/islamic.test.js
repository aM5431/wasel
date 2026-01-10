const IslamicRemindersService = require('../src/services/IslamicRemindersService');
const { db } = require('../src/database/db');
const { v4: uuidv4 } = require('uuid');

// Mock dependencies
jest.mock('../src/database/db', () => ({
    db: {
        get: jest.fn(),
        run: jest.fn(),
        all: jest.fn()
    }
}));

jest.mock('uuid', () => ({
    v4: jest.fn()
}));

describe('IslamicRemindersService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getOrCreateConfig', () => {
        test('should return existing config if found', async () => {
            const mockConfig = { id: 'cfg-1', user_id: 'user-1' };
            // Return config for first call, and truthy objects for subsequent checks (adhkar, fasting, prayers)
            db.get.mockResolvedValue(mockConfig);

            const result = await IslamicRemindersService.getOrCreateConfig('user-1');
            expect(result).toEqual(mockConfig);
            expect(db.run).not.toHaveBeenCalled();
        });

        test('should create new config if not found', async () => {
            db.get.mockResolvedValueOnce(null) // First check returns null
                .mockResolvedValueOnce({ id: 'new-cfg', user_id: 'user-1' }); // Second check (after create) returns new config

            uuidv4.mockReturnValue('new-cfg');
            db.run.mockResolvedValue({});

            const result = await IslamicRemindersService.getOrCreateConfig('user-1');

            // Verify inserts happen (config, 5 prayers, fasting, adhkar)
            // 1 config + 5 prayers + 1 fasting + 1 adhkar = 8
            expect(db.run).toHaveBeenCalledTimes(1 + 5 + 1 + 1);
            expect(db.run).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO islamic_reminders_config'),
                expect.any(Array)
            );
        });
    });

    describe('updateLocation', () => {
        test('should update location fields', async () => {
            const locData = {
                country: 'Egypt', city: 'Cairo',
                latitude: 30, longitude: 31,
                timezone: 'Africa/Cairo', prayer_calculation_method: 'Egypt'
            };

            db.run.mockResolvedValue({});
            db.get.mockResolvedValue({ id: 'cfg-1', ...locData });

            const result = await IslamicRemindersService.updateLocation('cfg-1', locData);

            expect(db.run).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE islamic_reminders_config'),
                expect.arrayContaining(['Egypt', 'Cairo', 30, 'cfg-1'])
            );
        });
    });

    describe('updatePrayerSetting', () => {
        test('should update general settings', async () => {
            // Mock successful update
            db.run.mockResolvedValue({ changes: 1 });
            // Mock returning updated config
            db.get.mockResolvedValue({ id: 'cfg-1', hijri_adjustment: 1, friday_kahf: 0 });

            const config = await IslamicRemindersService.updateGeneralSettings('cfg-1', 1, false);

            expect(config.hijri_adjustment).toBe(1);
            expect(config.friday_kahf).toBe(0);
            expect(db.run).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE islamic_reminders_config SET hijri_adjustment = ?, friday_kahf = ?'),
                [1, 0, 'cfg-1']
            );
        });

        test('should update fasting settings with time', async () => {
            // Mock successful update
            db.run.mockResolvedValue({ changes: 1 });

            const settings = { monday: 1, reminder_time: '19:00' };
            await IslamicRemindersService.updateFastingSettings('cfg-1', settings);

            expect(db.run).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE fasting_settings SET monday = ?, reminder_time = ? WHERE config_id = ?'),
                [1, '19:00', 'cfg-1']
            );
        });

        test('should retrieve morning adhkar with media', async () => {
            // Mock DB response
            db.get.mockResolvedValue({
                content_ar: 'الذكر مع صورة',
                type: 'adhkar',
                category: 'morning',
                media_url: 'https://example.com/image.jpg'
            });

            const ContentService = require('../src/services/ContentService');
            const content = await ContentService.getRandomContent('adhkar', 'morning');

            expect(content.media_url).toBe('https://example.com/image.jpg');
        });

        test('should update adhkar settings', async () => {
            db.run.mockResolvedValue({ changes: 1 });

            const settings = { morning_enabled: 0, morning_time: '06:00' };
            await IslamicRemindersService.updateAdhkarSettings('cfg-1', settings);

            expect(db.run).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE adhkar_settings SET morning_enabled = ?, morning_time = ? WHERE config_id = ?'),
                [0, '06:00', 'cfg-1']
            );
        });

        test('should retrieve morning adhkar', async () => {
            // Mock DB response for getRandomContent
            db.get.mockResolvedValue({
                content_ar: 'أصبحنا وأصبح الملك لله',
                type: 'adhkar',
                category: 'morning'
            });

            const ContentService = require('../src/services/ContentService');
            const content = await ContentService.getRandomContent('adhkar', 'morning');

            expect(content).toBeDefined();
            expect(content.category).toBe('morning');
            expect(db.get).toHaveBeenCalledWith(
                expect.stringContaining('SELECT * FROM content_library WHERE type = ? AND active = 1 AND category = ?'),
                expect.arrayContaining(['adhkar', 'morning'])
            );
        });

        test('should update prayer setting', async () => {
            const update = { enabled: 0, adhan_sound: 'makkah.mp3' };
            db.run.mockResolvedValue({});

            await IslamicRemindersService.updatePrayerSetting('prayer-id', update);

            expect(db.run).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE prayer_settings SET enabled = ?, adhan_sound = ?'),
                [0, 'makkah.mp3', 'prayer-id']
            );
        });
    });
});
