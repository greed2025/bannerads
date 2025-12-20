const path = require('path');

// file.jsが存在しない場合、まず空のモジュールを想定
let validateAndNormalizeFilename, validateProjectType;

try {
    const fileModule = require('../file');
    validateAndNormalizeFilename = fileModule.validateAndNormalizeFilename;
    validateProjectType = fileModule.validateProjectType;
} catch (e) {
    // モジュールがまだ存在しない場合
}

describe('validateAndNormalizeFilename', () => {
    test('should reject path separators in filename', () => {
        // Arrange & Act & Assert
        expect(() => validateAndNormalizeFilename('../../etc/passwd')).toThrow('Path separators not allowed');
        expect(() => validateAndNormalizeFilename('subdir/file.md')).toThrow('Path separators not allowed');
        expect(() => validateAndNormalizeFilename('subdir\\file.md')).toThrow('Path separators not allowed');
    });

    test('should reject absolute paths', () => {
        // Arrange & Act & Assert
        expect(() => validateAndNormalizeFilename('/etc/passwd')).toThrow('Absolute paths not allowed');
        // Windows絶対パスはパス区切りでも拒否される
        expect(() => validateAndNormalizeFilename('C:\\Windows\\System32')).toThrow();
    });

    test('should reject invalid characters', () => {
        // Arrange & Act & Assert
        expect(() => validateAndNormalizeFilename('file<script>.md')).toThrow('Invalid');
        expect(() => validateAndNormalizeFilename('file|name.md')).toThrow('Invalid');
    });

    test('should auto-append .md extension', () => {
        // Arrange & Act
        const result = validateAndNormalizeFilename('filename');
        
        // Assert
        expect(result).toBe('filename.md');
    });

    test('should not duplicate .md extension', () => {
        // Arrange & Act
        const result = validateAndNormalizeFilename('filename.md');
        
        // Assert
        expect(result).toBe('filename.md');
    });

    test('should allow safe filenames', () => {
        // Arrange & Act
        const result = validateAndNormalizeFilename('my-file_123.md');
        
        // Assert
        expect(result).toBe('my-file_123.md');
    });
});
