const ContentService = require('../src/services/ContentService');
const { db } = require('../src/database/db');
const { v4: uuidv4 } = require('uuid');

// Mock dependencies
jest.mock('../src/database/db', () => ({
    db: {
        run: jest.fn(),
        get: jest.fn(),
        all: jest.fn()
    }
}));

jest.mock('uuid', () => ({
    v4: jest.fn()
}));

describe('ContentService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('addContent', () => {
        test('should add content and return it', async () => {
            const mockId = 'uuid-123';
            uuidv4.mockReturnValue(mockId);
            const input = {
                type: 'adhkar',
                category: 'morning',
                content_ar: 'Test Content',
                source: 'Test Source'
            };

            // Mock db.run to resolve
            db.run.mockResolvedValue({});
            // Mock db.get (called by getContentById)
            db.get.mockResolvedValue({ id: mockId, ...input });

            const result = await ContentService.addContent(input);

            expect(db.run).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO'),
                expect.arrayContaining([mockId, 'adhkar', 'morning', 'Test Content'])
            );
            expect(result).toEqual({ id: mockId, ...input });
        });
    });

    describe('getContent', () => {
        test('should filter by type only', async () => {
            await ContentService.getContent('hadith');
            expect(db.all).toHaveBeenCalledWith(
                expect.stringContaining('WHERE type = ?'),
                ['hadith']
            );
        });

        test('should filter by type and category', async () => {
            await ContentService.getContent('adhkar', 'evening');
            expect(db.all).toHaveBeenCalledWith(
                expect.stringContaining('AND category = ?'),
                ['adhkar', 'evening']
            );
        });
    });

    describe('updateContent', () => {
        test('should update only provided fields', async () => {
            const updateData = { content_ar: 'Updated Text' };
            db.run.mockResolvedValue({});
            db.get.mockResolvedValue({ id: '1', ...updateData });

            await ContentService.updateContent('1', updateData);

            expect(db.run).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE content_library SET content_ar = ?'),
                ['Updated Text', '1']
            );
        });

        test('should do nothing if no fields provided', async () => {
            await ContentService.updateContent('1', {});
            expect(db.run).not.toHaveBeenCalled();
        });
    });
});
