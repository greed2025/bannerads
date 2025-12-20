const { config } = require('../index');
const path = require('path');

describe('config.paths', () => {
    test('should include banners path', () => {
        // Assert
        expect(config.paths.banners).toBeDefined();
        expect(config.paths.banners).toContain('banners');
        expect(path.isAbsolute(config.paths.banners)).toBe(true);
    });

    test('banners path should point to server/banners directory', () => {
        // Assert
        const expectedPath = path.resolve(__dirname, '../../../banners');
        expect(config.paths.banners).toBe(expectedPath);
    });
});
