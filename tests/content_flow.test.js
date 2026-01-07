
const SchedulerService = require('../src/services/SchedulerService');
const ContentService = require('../src/services/ContentService');
const ExternalContentService = require('../src/services/ExternalContentService'); // Will be mocked

// Mock dependencies
jest.mock('../src/services/ContentService');
jest.mock('../src/services/ExternalContentService');
jest.mock('../src/services/baileys/SessionManager', () => ({
    getSession: jest.fn().mockReturnValue({ user: { id: 'me' } })
}));

// Mock SchedulerService.sendWhatsAppMessage to avoid actual DB/Network calls
// sendUserContentReminder calls this.sendWhatsAppMessage (static). 
// Spying on static method of the class under test is tricky if not exported instance.
// But we can spy on it.
jest.spyOn(SchedulerService, 'sendWhatsAppMessage').mockResolvedValue(1);

describe('Scheduler Content Flow', () => {

    afterEach(() => {
        jest.clearAllMocks();
    });

    const mockConfig = {
        id: 'conf1',
        session_id: 'sess1',
        user_id: 'user1'
    };

    test('should prefer local content when source is manual', async () => {
        ContentService.getRandomContent.mockResolvedValue({ id: 'loc1', content_ar: 'Local', active: 1 });

        await SchedulerService.sendUserContentReminder(mockConfig, 'type', 'cat', 'manual');

        expect(ContentService.getRandomContent).toHaveBeenCalled();
        expect(ExternalContentService.getDailyContent).not.toHaveBeenCalled();
        // Should mark as sent
        expect(ContentService.markContentAsSent).toHaveBeenCalledWith('loc1');
    });

    test('should prefer external content when source is auto', async () => {
        ExternalContentService.getDailyContent.mockResolvedValue({ content: 'Ext', media_url: 'http://img' });

        await SchedulerService.sendUserContentReminder(mockConfig, 'type', 'cat', 'auto');

        expect(ExternalContentService.getDailyContent).toHaveBeenCalled();
        // Should NOT mark local as sent (it's external)
        expect(ContentService.markContentAsSent).not.toHaveBeenCalled();
    });

    test('should fallback to external if mixed and local missing', async () => {
        ContentService.getRandomContent.mockResolvedValue(null);
        ExternalContentService.getDailyContent.mockResolvedValue({ content: 'Ext Fallback' });

        await SchedulerService.sendUserContentReminder(mockConfig, 'type', 'cat', 'mixed');

        expect(ContentService.getRandomContent).toHaveBeenCalled();
        expect(ExternalContentService.getDailyContent).toHaveBeenCalled();
    });
});
