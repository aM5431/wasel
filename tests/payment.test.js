const PaymentService = require('../src/services/PaymentService');
const { db } = require('../src/database/db');
const NotificationService = require('../src/services/NotificationService');
const messageService = require('../src/services/baileys/MessageService');

// Mock dependencies
jest.mock('../src/database/db', () => ({
    db: {
        run: jest.fn(),
        get: jest.fn()
    }
}));
jest.mock('../src/services/NotificationService', () => ({
    getAdminSession: jest.fn()
}));
jest.mock('../src/services/baileys/MessageService', () => ({
    sendMessage: jest.fn()
}));

// Need to mock SessionManager if it's used directly, but checking the code it seems mostly used via NotificationService. 
// But PaymentService imports it. Just in case:
jest.mock('../src/services/baileys/SessionManager', () => ({}));

describe('PaymentService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('createPaymentRequest', () => {
        test('should create subscription and payment records', async () => {
            const userId = 'u1';
            const planId = 'p1';

            // Mock DB responses
            // 1. Check pending subscription -> returns null (so create one)
            db.get.mockResolvedValueOnce(null);
            // 2. Insert subscription -> returns ID
            db.run.mockResolvedValueOnce({ id: 'sub-new' });
            // 3. Insert payment -> returns ID
            db.run.mockResolvedValueOnce({ id: 'pay-new' });

            // Mock async notification
            NotificationService.getAdminSession.mockResolvedValue('session-admin');
            // We need to mock DB calls inside notifyAdminWithReceipt as well
            // createPaymentRequest calls notifyAdminWithReceipt asynchronously.
            // If we await the promise returned by createPaymentRequest, the notify might rely on catching error or separate promise.
            // PaymentService Line 38: calling notify without await!
            // So we might not catch it in test unless we wait a bit or spy on it.

            // NOTE: Since line 38 is fire-and-forget (no await), the test will finish createPaymentRequest immediately.
            // We verify the DB insertions first.

            const result = await PaymentService.createPaymentRequest(userId, planId, 100, 'Vodafone', 'REF123', '/path.jpg');

            expect(result).toBe('pay-new');
            expect(db.run).toHaveBeenCalledTimes(2); // insert sub + insert payment
            expect(db.run).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO payments'),
                expect.arrayContaining(['u1', 'sub-new', 100, 'Vodafone', 'REF123'])
            );
        });
    });

    describe('notifyAdminWithReceipt', () => {
        test('should send message to admin', async () => {
            // Mock data
            NotificationService.getAdminSession.mockResolvedValue('sess-1');
            db.get.mockResolvedValueOnce({ name: 'User', phone: '123' }) // User
                .mockResolvedValueOnce({ name: 'Plan', duration_days: 30 }); // Plan

            await PaymentService.notifyAdminWithReceipt('pay-1', 'u1', 'p1', 100, 'Cash', 'Ref', '/img.jpg');

            expect(messageService.sendMessage).toHaveBeenCalledWith(
                'sess-1',
                '123',
                expect.stringContaining('طلب دفع جديد')
            );
        });
    });
});
