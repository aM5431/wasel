const NotificationService = require('../src/services/NotificationService');
const { db } = require('../src/database/db');
const sessionManager = require('../src/services/baileys/SessionManager');
const messageService = require('../src/services/baileys/MessageService');
const fs = require('fs');

// Mock dependencies
jest.mock('../src/database/db', () => ({
    db: {
        all: jest.fn(),
        get: jest.fn()
    }
}));
jest.mock('../src/services/baileys/SessionManager', () => ({
    getAllSessions: jest.fn()
}));
jest.mock('../src/services/baileys/MessageService', () => ({
    sendMessage: jest.fn(),
    sendMedia: jest.fn()
}));
jest.mock('fs');
jest.mock('path', () => ({
    join: jest.fn((...args) => args.join('/'))
}));

describe('NotificationService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Default mocks
        db.all.mockResolvedValue([{ id: 'admin-1', phone: '123456' }]);
        sessionManager.getAllSessions.mockReturnValue([{
            sessionId: 'user_admin-1_123',
            connected: true,
            phoneNumber: '123456'
        }]);
    });

    describe('getAdminSession', () => {
        test('should find connected admin session by ID pattern', async () => {
            const sessionId = await NotificationService.getAdminSession();
            expect(sessionId).toBe('user_admin-1_123');
        });

        test('should return null if no admin found', async () => {
            db.all.mockResolvedValue([]);
            const sessionId = await NotificationService.getAdminSession();
            expect(sessionId).toBeNull();
        });
    });

    describe('sendTrialActivation', () => {
        test('should send message if admin session exists', async () => {
            const user = { name: 'Ali', phone: '201000000' };
            const plan = { name: 'Free', duration_days: 7 };
            const subscription = { endDate: '2025-01-01' };

            messageService.sendMessage.mockResolvedValue(true);

            const result = await NotificationService.sendTrialActivation(user, plan, subscription);

            expect(result).toBe(true);
            expect(messageService.sendMessage).toHaveBeenCalledWith(
                'user_admin-1_123',
                '201000000',
                expect.stringContaining('مرحباً بك في منصة واصل')
            );
        });

        test('should fail gracefully if sendMessage throws', async () => {
            messageService.sendMessage.mockRejectedValue(new Error('Network error'));
            const user = { name: 'Ali', phone: '201000000' };
            const result = await NotificationService.sendTrialActivation(user, { name: 'p' }, { endDate: 'd' });
            expect(result).toBe(false);
        });
    });

    describe('sendPaymentNotification', () => {
        test('should send media message', async () => {
            const payment = {
                userId: 'u1', userName: 'User', userPhone: '123',
                amount: 100, method: 'Vodafone', planName: 'Pro'
            };

            db.get.mockResolvedValue({ phone: '999admin' });
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue('buffer-data');

            const result = await NotificationService.sendPaymentNotification(payment, '/uploads/rec.jpg');

            expect(result).toBe(true);
            expect(messageService.sendMedia).toHaveBeenCalled();
        });
    });
});
