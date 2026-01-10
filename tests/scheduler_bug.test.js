const SchedulerService = require('../src/services/SchedulerService');
const { db } = require('../src/database/db');
const IslamicRemindersService = require('../src/services/IslamicRemindersService');
const MessageService = require('../src/services/baileys/MessageService');
const SessionManager = require('../src/services/baileys/SessionManager');

jest.mock('../src/database/db', () => ({
    db: {
        get: jest.fn(),
        all: jest.fn()
    }
}));
jest.mock('../src/services/IslamicRemindersService', () => ({
    getRecipients: jest.fn(),
    getPrayerSettings: jest.fn(),
    getFastingSettings: jest.fn()
}));
jest.mock('../src/services/baileys/MessageService', () => ({
    sendMessage: jest.fn(),
    addToQueue: jest.fn()
}));
jest.mock('../src/services/baileys/SessionManager', () => ({
    getSession: jest.fn()
}));
// Mock ContentService (lazy-loaded in SchedulerService.js line 125, so we might need to mock module loading or just ignore)
jest.mock('../src/services/ContentService', () => ({
    getRandomContent: jest.fn()
}), { virtual: true });


describe('SchedulerService Bug Reproduction', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Default session mock
        SessionManager.getSession.mockReturnValue({ user: { id: 'me' }, connected: true });
        // Default config
        db.get.mockResolvedValue({ id: 'cfg-1', user_id: 'u1' });
    });

    test('should send to recipients using explicit configId', async () => {
        const recipients = [
            { id: 1, name: 'Group A', whatsapp_id: '123@g.us', type: 'group', enabled: 1 }
        ];

        IslamicRemindersService.getRecipients.mockResolvedValue(recipients);

        // Call with explicit configId 'cfg-99'
        await SchedulerService.sendWhatsAppMessage('sess-1', 'u1', 'Test Msg', 'cfg-99');

        // Should use 'cfg-99' to get recipients
        expect(IslamicRemindersService.getRecipients).toHaveBeenCalledWith('cfg-99');

        // Should NOT need to look up config from DB if configId is provided
        // (Assuming DB lookup handles null efficiently or we spy on it)
        // In my implementation: "if (!targetConfigId) { ... db.get ... }"
        // So db.get should NOT be called for config lookup.
        expect(db.get).not.toHaveBeenCalledWith(expect.stringContaining('FROM islamic_reminders_config'), expect.anything());

        expect(MessageService.addToQueue).toHaveBeenCalledWith('sess-1', '123@g.us', 'Test Msg', 'text', expect.any(Object));
    });

    test('should fallback to legacy lookup if configId missing', async () => {
        const recipients = [{ id: 2, whatsapp_id: '456@s.whatsapp.net', enabled: 1 }];
        IslamicRemindersService.getRecipients.mockResolvedValue(recipients);
        db.get.mockResolvedValue({ id: 'legacy-cfg' }); // Mock lookup

        await SchedulerService.sendWhatsAppMessage('sess-1', 'u1', 'Legacy Msg'); // No 4th arg

        expect(db.get).toHaveBeenCalledWith(expect.stringContaining('FROM islamic_reminders_config'), expect.anything());
        expect(IslamicRemindersService.getRecipients).toHaveBeenCalledWith('legacy-cfg');
        expect(MessageService.addToQueue).toHaveBeenCalledWith('sess-1', '456@s.whatsapp.net', 'Legacy Msg', 'text', expect.any(Object));
    });

    test('should send to all enabled recipients', async () => {
        const recipients = [
            { id: 1, name: 'Group A', whatsapp_id: '123@g.us', type: 'group', enabled: 1 }, // Group
            { id: 2, name: 'Person B', whatsapp_id: '456@s.whatsapp.net', type: 'individual', enabled: 1 }, // Person
            { id: 3, name: 'Person C', whatsapp_id: '789@s.whatsapp.net', type: 'individual', enabled: 0 }  // Disabled
        ];

        IslamicRemindersService.getRecipients.mockResolvedValue(recipients);

        await SchedulerService.sendWhatsAppMessage('sess-1', 'u1', 'Test Message');

        // Should call sendMessage 2 times (Group A, Person B)
        expect(MessageService.addToQueue).toHaveBeenCalledTimes(2);

        // Exact calls
        expect(MessageService.addToQueue).toHaveBeenCalledWith('sess-1', '123@g.us', 'Test Message', 'text', expect.any(Object));
        expect(MessageService.addToQueue).toHaveBeenCalledWith('sess-1', '456@s.whatsapp.net', 'Test Message', 'text', expect.any(Object));

        // Should NOT call for disabled
        expect(MessageService.addToQueue).not.toHaveBeenCalledWith('sess-1', '789@s.whatsapp.net', expect.anything(), expect.anything(), expect.anything());
    });

    test('should fallback to owner if NO recipients exist', async () => {
        IslamicRemindersService.getRecipients.mockResolvedValue([]);
        // Mock user lookup
        db.get.mockResolvedValueOnce({ id: 'cfg-1', user_id: 'u1' }) // config
            .mockResolvedValueOnce({ phone: 'user-phone' });      // user

        await SchedulerService.sendWhatsAppMessage('sess-1', 'u1', 'Test Message');

        expect(MessageService.addToQueue).toHaveBeenCalledWith('sess-1', 'user-phone', 'Test Message', 'text', expect.any(Object));
    });
});
