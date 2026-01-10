// Mock dependencies BEFORE requiring the module under test
jest.mock('../src/services/NotificationService', () => ({
    createAdminNotification: jest.fn().mockResolvedValue(true)
}));

const AuthService = require('../src/services/auth');
const { db } = require('../src/database/db');

// Mock the database dependency
jest.mock('../src/database/db', () => ({
    db: {
        get: jest.fn(),
        run: jest.fn(),
    },
}));

describe('AuthService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('register', () => {
        const userData = {
            name: 'Test User',
            phone: '1234567890',
            email: 'test@example.com',
            password: 'password123',
            planId: 1
        };

        test('should register new user successfully', async () => {
            // Mock 1: Check existing user (return null = not found)
            db.get.mockResolvedValueOnce(null);
            // Mock 2: Get plan (return plan object)
            db.get.mockResolvedValueOnce({
                id: 1,
                name: 'Basic Plan',
                duration_days: 30,
                is_trial: 0
            });
            // Mock 3 & 4: Insert User & Subscription
            db.run.mockResolvedValue({ id: 1 });

            const result = await AuthService.register(userData);

            expect(result).toHaveProperty('userId');
            expect(result).toHaveProperty('status', 'pending');
            expect(db.run).toHaveBeenCalledTimes(2);
            expect(db.run).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO users'),
                expect.any(Array)
            );
        });

        test('should fail if phone/email already exists', async () => {
            // Mock 1: Check existing user (return found)
            db.get.mockResolvedValueOnce({ id: 'existing-id' });

            await expect(AuthService.register(userData))
                .rejects.toThrow('رقم الهاتف أو البريد الإلكتروني مسجل بالفعل');

            expect(db.run).not.toHaveBeenCalled();
        });

        test('should fail if plan does not exist', async () => {
            // Mock 1: Check existing user (null)
            db.get.mockResolvedValueOnce(null);
            // Mock 2: Get plan (null = not found)
            db.get.mockResolvedValueOnce(null);

            await expect(AuthService.register(userData))
                .rejects.toThrow('الباقة غير موجودة');
        });
    });

    describe('login', () => {
        test('should login with valid credentials', async () => {
            // We need to mock bcrypt.compare, but AuthService likely imports valid bcrypt.
            // Wait, AuthService code does: bcrypt.compare(password, user.password_hash)
            // We rely on real bcrypt here since we didn't mock it explicitly?
            // Actually, bcrypt hash generated in register uses real bcrypt.
            // Let's create a real hash for the mock user or mock bcrypt too.
            // Ideally unit tests shouldn't be slow (bcrypt is slow).
            // For simplicity, let's assume we use real bcrypt, it's fine for a few tests.

            const bcrypt = require('bcrypt');
            const hash = await bcrypt.hash('password123', 10);

            // Mock get user
            db.get.mockResolvedValueOnce({
                id: 'user-id',
                name: 'User',
                password_hash: hash
            });

            const user = await AuthService.login('test@example.com', 'password123');
            expect(user).toHaveProperty('id', 'user-id');
        });

        test('should fail with invalid password', async () => {
            const bcrypt = require('bcrypt');
            const hash = await bcrypt.hash('password123', 10);

            db.get.mockResolvedValueOnce({
                id: 'user-id',
                password_hash: hash
            });

            await expect(AuthService.login('test@example.com', 'wrongpassword'))
                .rejects.toThrow('بيانات الدخول غير صحيحة');
        });

        test('should fail if user not found', async () => {
            db.get.mockResolvedValueOnce(null);

            await expect(AuthService.login('unknown@email.com', 'pass'))
                .rejects.toThrow('بيانات الدخول غير صحيحة');
        });
    });
});
