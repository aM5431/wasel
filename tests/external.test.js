
const ExternalContentService = require('../src/services/ExternalContentService');

// Mock axios globally for this test file
jest.mock('axios');
const axios = require('axios');

describe('ExternalContentService', () => {

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('should fetch daily content with hadith and image', async () => {
        // Mock successful API response
        axios.get.mockResolvedValue({
            data: {
                data: {
                    hadith_arabic: 'إنما الأعمال بالنيات',
                    hadith_urdu: 'Actions are by intentions'
                }
            }
        });

        const content = await ExternalContentService.getDailyContent('image');

        expect(content).toBeDefined();
        expect(content.type).toBe('hadith');
        expect(content.content).toBe('إنما الأعمال بالنيات');
        expect(content.media_url).toMatch(/^https:\/\/images\.unsplash\.com/);
        expect(content.media_type).toBe('image');
        expect(axios.get).toHaveBeenCalled();
    });

    test('should return fallback if API fails', async () => {
        // Mock API failure
        axios.get.mockRejectedValue(new Error('Network Error'));

        // Silence console.error for this test
        jest.spyOn(console, 'error').mockImplementation(() => { });

        const content = await ExternalContentService.getDailyContent();

        expect(content).toBeDefined();
        // Should fallback to adhkar
        expect(content.type).toBe('adhkar');
        expect(content.content).toContain('سبحان الله');
        expect(content.media_url).toBeDefined();
    });
});
