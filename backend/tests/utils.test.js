import { describe, test, expect } from '@jest/globals';
import { validateAlias } from '../src/utils/id.js';
import { validateUploadBody, validatePassword, sanitizeFilename } from '../src/utils/validation.js';

describe('validateAlias', () => {
    test('accepts valid aliases', () => {
        expect(validateAlias('my-file')).toBe(true);
        expect(validateAlias('my_file')).toBe(true);
        expect(validateAlias('test123')).toBe(true);
        expect(validateAlias('a-b-c')).toBe(true);
        expect(validateAlias('abc')).toBe(true);
        expect(validateAlias('a'.repeat(40))).toBe(true);
    });

    test('rejects invalid aliases', () => {
        expect(validateAlias('')).toBe(false);
        expect(validateAlias(null)).toBe(false);
        expect(validateAlias('UPPERCASE')).toBe(false);
        expect(validateAlias('spaces not allowed')).toBe(false);
        expect(validateAlias('special!@#')).toBe(false);
        expect(validateAlias('a'.repeat(41))).toBe(false);
    });

    test('rejects reserved routes', () => {
        expect(validateAlias('admin')).toBe(false);
        expect(validateAlias('ADMIN')).toBe(false);
        expect(validateAlias('api')).toBe(false);
        expect(validateAlias('upload')).toBe(false);
        expect(validateAlias('download')).toBe(false);
        expect(validateAlias('d')).toBe(false);
        expect(validateAlias('file')).toBe(false);
    });
});

describe('validateUploadBody', () => {
    test('validates retention_type is required', () => {
        const errors = validateUploadBody({});
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0]).toContain('retention_type');
    });

    test('validates time-based retention needs value', () => {
        const errors = validateUploadBody({ retention_type: 'days' });
        expect(errors.some(e => e.includes('retention_value'))).toBe(true);
    });

    test('accepts valid time-based retention', () => {
        const errors = validateUploadBody({
            retention_type: 'days',
            retention_value: '7',
        });
        expect(errors.length).toBe(0);
    });

    test('accepts one_download retention without value', () => {
        const errors = validateUploadBody({ retention_type: 'one_download' });
        expect(errors.length).toBe(0);
    });

    test('accepts permanent retention without value', () => {
        const errors = validateUploadBody({ retention_type: 'permanent' });
        expect(errors.length).toBe(0);
    });

    test('rejects retention_value over limit', () => {
        const errors = validateUploadBody({
            retention_type: 'days',
            retention_value: '99999',
        });
        expect(errors.length).toBeGreaterThan(0);
    });

    test('validates password length', () => {
        const errors = validateUploadBody({
            retention_type: 'permanent',
            password: 'a'.repeat(200),
        });
        expect(errors.length).toBeGreaterThan(0);
    });

    test('allows valid password', () => {
        const errors = validateUploadBody({
            retention_type: 'permanent',
            password: 'validpass123',
        });
        expect(errors.length).toBe(0);
    });
});

describe('validatePassword', () => {
    test('accepts valid passwords', () => {
        expect(validatePassword('hello')).toBe(true);
        expect(validatePassword('a')).toBe(true);
        expect(validatePassword('a'.repeat(128))).toBe(true);
    });

    test('rejects invalid passwords', () => {
        expect(validatePassword('')).toBe(false);
        expect(validatePassword(null)).toBe(false);
        expect(validatePassword(undefined)).toBe(false);
        expect(validatePassword(123)).toBe(false);
        expect(validatePassword('a'.repeat(129))).toBe(false);
    });
});

describe('sanitizeFilename', () => {
    test('preserves normal filenames', () => {
        expect(sanitizeFilename('hello.txt')).toBe('hello.txt');
        expect(sanitizeFilename('my document.pdf')).toBe('my document.pdf');
    });

    test('removes path separators', () => {
        expect(sanitizeFilename('../../etc/passwd')).not.toContain('/');
        expect(sanitizeFilename('..\\..\\Windows\\file.txt')).not.toContain('\\');
    });

    test('removes null bytes', () => {
        expect(sanitizeFilename('test\x00.txt')).toBe('test_.txt');
    });

    test('handles empty result', () => {
        const result = sanitizeFilename('');
        expect(result).toBe('unnamed_file');
    });

    test('limits length', () => {
        const long = 'a'.repeat(300);
        const result = sanitizeFilename(long);
        expect(result.length).toBeLessThanOrEqual(255);
    });
});
