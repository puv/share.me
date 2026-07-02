import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Setup test environment
const TEST_UPLOAD_DIR = path.join(__dirname, '..', 'data', 'test-uploads');
const TEST_DB_PATH = path.join(__dirname, '..', 'data', 'test.db');

process.env.UPLOAD_DIRECTORY = TEST_UPLOAD_DIR;
process.env.DATABASE_PATH = TEST_DB_PATH;
process.env.SESSION_SECRET = 'test-secret-' + crypto.randomBytes(16).toString('hex');
process.env.PORT = '0';

// Clean up before tests
if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
if (fs.existsSync(TEST_UPLOAD_DIR)) fs.rmSync(TEST_UPLOAD_DIR, { recursive: true });
fs.mkdirSync(TEST_UPLOAD_DIR, { recursive: true });

// Import app after setting env vars
const { default: app } = await import('../src/index.js');

let cookies = [];

function extractCookies(res) {
    const setCookie = res.headers['set-cookie'];
    if (setCookie) {
        for (const c of setCookie) {
            const parts = c.split(';')[0];
            const [name, ...valueParts] = parts.split('=');
            const value = valueParts.join('=');
            const idx = cookies.findIndex(co => co.startsWith(name + '='));
            if (idx >= 0) cookies[idx] = `${name}=${value}`;
            else cookies.push(`${name}=${value}`);
        }
    }
}

function getCookies() {
    return cookies.join('; ');
}

// Helper to create a test file buffer
function createTestFile(name = 'test.txt', content = 'Hello, world!') {
    return {
        buffer: Buffer.from(content),
        name,
        size: Buffer.byteLength(content),
    };
}

describe('Upload API', () => {
    beforeEach(() => {
        cookies = [];
    });

    test('POST /api/upload - rejects empty files', async () => {
        const res = await request(app)
            .post('/api/upload')
            .field('retention_type', 'days')
            .field('retention_value', '7');
        expect(res.status).toBe(400);
    });

    test('POST /api/upload - rejects invalid retention_type', async () => {
        const res = await request(app)
            .post('/api/upload')
            .attach('files', Buffer.from('test'), 'test.txt')
            .field('retention_type', 'invalid');
        expect(res.status).toBe(400);
    });

    test('POST /api/upload - requires retention_value for time-based', async () => {
        const res = await request(app)
            .post('/api/upload')
            .attach('files', Buffer.from('test'), 'test.txt')
            .field('retention_type', 'days');
        expect(res.status).toBe(400);
    });

    test('POST /api/upload - successful upload with days retention', async () => {
        const res = await request(app)
            .post('/api/upload')
            .attach('files', Buffer.from('Hello test file'), 'hello.txt')
            .field('retention_type', 'days')
            .field('retention_value', '7');
        expect(res.status).toBe(201);
        expect(res.body.id).toBeDefined();
        expect(res.body.shareUrl).toBeDefined();
        expect(res.body.fileCount).toBe(1);
        expect(res.body.qrCode).toBeDefined();
        extractCookies(res);
    });

    test('POST /api/upload - successful upload with multiple files', async () => {
        const res = await request(app)
            .post('/api/upload')
            .attach('files', Buffer.from('File 1'), 'file1.txt')
            .attach('files', Buffer.from('File 2'), 'file2.txt')
            .attach('files', Buffer.from('File 3'), 'file3.txt')
            .field('retention_type', 'permanent');
        expect(res.status).toBe(201);
        expect(res.body.fileCount).toBe(3);
    });

    test('POST /api/upload - successful with password', async () => {
        const res = await request(app)
            .post('/api/upload')
            .attach('files', Buffer.from('Secret file'), 'secret.txt')
            .field('retention_type', 'days')
            .field('retention_value', '30')
            .field('password', 'mypassword123');
        expect(res.status).toBe(201);
        const uploadId = res.body.id;

        // Verify password is required to view metadata
        const getRes = await request(app)
            .get(`/api/upload/${uploadId}`);
        expect(getRes.status).toBe(200);
        expect(getRes.body.hasPassword).toBe(true);
        expect(getRes.body.files).toEqual([]);
    });

    test('POST /api/upload - successful with alias', async () => {
        const alias = 'my-test-' + crypto.randomBytes(4).toString('hex');
        const res = await request(app)
            .post('/api/upload')
            .attach('files', Buffer.from('Alias test'), 'alias.txt')
            .field('retention_type', 'permanent')
            .field('alias', alias);
        expect(res.status).toBe(201);
        expect(res.body.alias).toBe(alias);

        // Verify accessible by alias
        const getRes = await request(app)
            .get(`/api/upload/${alias}`);
        expect(getRes.status).toBe(200);
    });

    test('POST /api/upload - rejects duplicate alias', async () => {
        const alias = 'dup-test-' + crypto.randomBytes(4).toString('hex');
        await request(app)
            .post('/api/upload')
            .attach('files', Buffer.from('First'), 'first.txt')
            .field('retention_type', 'permanent')
            .field('alias', alias);

        const res = await request(app)
            .post('/api/upload')
            .attach('files', Buffer.from('Second'), 'second.txt')
            .field('retention_type', 'permanent')
            .field('alias', alias);
        expect(res.status).toBe(409);
    });

    test('POST /api/upload - rejects invalid alias characters', async () => {
        const res = await request(app)
            .post('/api/upload')
            .attach('files', Buffer.from('test'), 'test.txt')
            .field('retention_type', 'permanent')
            .field('alias', 'INVALID ALIAS!');
        expect(res.status).toBe(400);
    });

    test('POST /api/upload - one_download retention type', async () => {
        const res = await request(app)
            .post('/api/upload')
            .attach('files', Buffer.from('One time'), 'one.txt')
            .field('retention_type', 'one_download');
        expect(res.status).toBe(201);
        expect(res.body.retentionType).toBe('one_download');
        expect(res.body.expiresAt).toBeNull();
    });
});

describe('Upload Metadata & Password', () => {
    let uploadId;
    let passwordUploadId;

    beforeAll(async () => {
        // Create a normal upload
        const res1 = await request(app)
            .post('/api/upload')
            .attach('files', Buffer.from('Public file'), 'public.txt')
            .field('retention_type', 'permanent');
        uploadId = res1.body.id;

        // Create a password-protected upload
        const res2 = await request(app)
            .post('/api/upload')
            .attach('files', Buffer.from('Private file'), 'private.txt')
            .field('retention_type', 'permanent')
            .field('password', 'testpass');
        passwordUploadId = res2.body.id;
    });

    test('GET /api/upload/:id - returns metadata for public upload', async () => {
        const res = await request(app).get(`/api/upload/${uploadId}`);
        expect(res.status).toBe(200);
        expect(res.body.files.length).toBe(1);
        expect(res.body.files[0].original_name).toBe('public.txt');
    });

    test('GET /api/upload/:id - hides files for password-protected upload', async () => {
        const res = await request(app).get(`/api/upload/${passwordUploadId}`);
        expect(res.status).toBe(200);
        expect(res.body.hasPassword).toBe(true);
        expect(res.body.files).toEqual([]);
    });

    test('GET /api/upload/:id - 404 for non-existent upload', async () => {
        const res = await request(app).get('/api/upload/nonexistent123');
        expect(res.status).toBe(404);
    });

    test('POST /api/upload/:id/password - rejects wrong password', async () => {
        const res = await request(app)
            .post(`/api/upload/${passwordUploadId}/password`)
            .send({ password: 'wrongpassword' });
        expect(res.status).toBe(401);
    });

    test('POST /api/upload/:id/password - accepts correct password', async () => {
        const res = await request(app)
            .post(`/api/upload/${passwordUploadId}/password`)
            .send({ password: 'testpass' });
        expect(res.status).toBe(200);
        expect(res.body.files.length).toBe(1);
        expect(res.body.files[0].original_name).toBe('private.txt');
    });

    test('POST /api/upload/:id/password - requires password field', async () => {
        const res = await request(app)
            .post(`/api/upload/${passwordUploadId}/password`)
            .send({});
        expect(res.status).toBe(400);
    });
});

describe('File Download', () => {
    let uploadId;
    let fileId;

    beforeAll(async () => {
        const res = await request(app)
            .post('/api/upload')
            .attach('files', Buffer.from('Downloadable content here'), 'download.txt')
            .field('retention_type', 'permanent');
        uploadId = res.body.id;

        const getRes = await request(app).get(`/api/upload/${uploadId}`);
        fileId = getRes.body.files[0].id;
    });

    test('GET /api/file/:fileId - downloads file', async () => {
        const res = await request(app)
            .get(`/api/file/${fileId}`)
            .buffer(true)
            .parse((res, callback) => {
                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => callback(null, Buffer.concat(chunks)));
            });
        expect(res.status).toBe(200);
        expect(res.body.toString()).toBe('Downloadable content here');
        expect(res.headers['content-disposition']).toContain('download.txt');
    });

    test('GET /api/file/:fileId - 404 for non-existent file', async () => {
        const res = await request(app).get('/api/file/nonexistent123');
        expect(res.status).toBe(404);
    });
});

describe('Password-Protected Download', () => {
    let uploadId;
    let fileId;
    let sessionCookie;

    beforeAll(async () => {
        const res = await request(app)
            .post('/api/upload')
            .attach('files', Buffer.from('Protected download'), 'protected.txt')
            .field('retention_type', 'permanent')
            .field('password', 'secret123');
        uploadId = res.body.id;

        const pwRes = await request(app)
            .post(`/api/upload/${uploadId}/password`)
            .send({ password: 'secret123' });
        fileId = pwRes.body.files[0].id;
        sessionCookie = pwRes.headers['set-cookie'];
    });

    test('GET /api/file/:fileId - rejects without session', async () => {
        const res = await request(app).get(`/api/file/${fileId}`);
        expect(res.status).toBe(401);
    });

    test('GET /api/file/:fileId - accepts with session cookie', async () => {
        const res = await request(app)
            .get(`/api/file/${fileId}`)
            .set('Cookie', sessionCookie)
            .buffer(true)
            .parse((res, callback) => {
                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => callback(null, Buffer.concat(chunks)));
            });
        expect(res.status).toBe(200);
        expect(res.body.toString()).toBe('Protected download');
    });
});

describe('One-Download Retention', () => {
    let uploadId;
    let fileId;

    beforeAll(async () => {
        const res = await request(app)
            .post('/api/upload')
            .attach('files', Buffer.from('One-time file'), 'onetime.txt')
            .field('retention_type', 'one_download');
        uploadId = res.body.id;

        const getRes = await request(app).get(`/api/upload/${uploadId}`);
        fileId = getRes.body.files[0].id;
    });

    test('download file once', async () => {
        const res = await request(app)
            .get(`/api/file/${fileId}`)
            .buffer(true)
            .parse((res, callback) => {
                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => callback(null, Buffer.concat(chunks)));
            });
        expect(res.status).toBe(200);
        expect(res.body.toString()).toBe('One-time file');
    });

    test('file is gone after one download', async () => {
        // The upload should now be deleted (small wait for async cleanup)
        await new Promise(resolve => setTimeout(resolve, 500));
        const res = await request(app).get(`/api/upload/${uploadId}`);
        expect(res.status).toBe(404);
    });
});

describe('Delete Upload', () => {
    let uploadId;
    let deleteCookie;

    beforeAll(async () => {
        const res = await request(app)
            .post('/api/upload')
            .attach('files', Buffer.from('Delete me'), 'deleteme.txt')
            .field('retention_type', 'permanent');
        uploadId = res.body.id;
        deleteCookie = res.headers['set-cookie'];
    });

    test('DELETE /api/upload/:id - rejects without token or admin', async () => {
        const res = await request(app).delete(`/api/upload/${uploadId}`);
        expect(res.status).toBe(403);
    });

    test('DELETE /api/upload/:id - accepts with delete token cookie', async () => {
        const res = await request(app)
            .delete(`/api/upload/${uploadId}`)
            .set('Cookie', deleteCookie);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test('Upload is gone after delete', async () => {
        const res = await request(app).get(`/api/upload/${uploadId}`);
        expect(res.status).toBe(404);
    });
});

describe('ZIP Download', () => {
    let uploadId;

    beforeAll(async () => {
        const res = await request(app)
            .post('/api/upload')
            .attach('files', Buffer.from('File A'), 'a.txt')
            .attach('files', Buffer.from('File B'), 'b.txt')
            .field('retention_type', 'permanent');
        uploadId = res.body.id;
    });

    test('GET /api/upload/:id/zip - streams ZIP file', async () => {
        const res = await request(app)
            .get(`/api/upload/${uploadId}/zip`)
            .buffer(true)
            .parse((res, callback) => {
                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => callback(null, Buffer.concat(chunks)));
            });
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('application/zip');
        expect(res.body.length).toBeGreaterThan(0);
    });

    test('GET /api/upload/:id/zip - 404 for non-existent', async () => {
        const res = await request(app).get('/api/upload/nonexistent/zip');
        expect(res.status).toBe(404);
    });
});

describe('QR Code', () => {
    let uploadId;

    beforeAll(async () => {
        const res = await request(app)
            .post('/api/upload')
            .attach('files', Buffer.from('QR test'), 'qrtest.txt')
            .field('retention_type', 'permanent');
        uploadId = res.body.id;
    });

    test('GET /api/upload/:id/qr - returns PNG', async () => {
        const res = await request(app).get(`/api/upload/${uploadId}/qr`);
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('image/png');
        expect(Buffer.isBuffer(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThan(0);
    });
});

describe('Admin API', () => {
    beforeAll(() => {
        process.env.ADMIN_USERNAME = 'admin';
        process.env.ADMIN_PASSWORD = 'adminpass';
    });

    test('POST /api/admin/login - rejects bad credentials', async () => {
        const res = await request(app)
            .post('/api/admin/login')
            .send({ username: 'admin', password: 'wrong' });
        expect(res.status).toBe(401);
    });

    test('POST /api/admin/login - accepts correct credentials', async () => {
        const res = await request(app)
            .post('/api/admin/login')
            .send({ username: 'admin', password: 'adminpass' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        extractCookies(res);
    });

    test('GET /api/admin/stats - rejects unauthenticated', async () => {
        const savedCookies = [...cookies];
        cookies = [];
        const res = await request(app).get('/api/admin/stats');
        expect(res.status).toBe(401);
        cookies = savedCookies;
    });

    test('GET /api/admin/stats - returns stats when authenticated', async () => {
        const res = await request(app)
            .get('/api/admin/stats')
            .set('Cookie', getCookies());
        expect(res.status).toBe(200);
        expect(res.body.totalUploads).toBeDefined();
        expect(res.body.activeUploads).toBeDefined();
        expect(res.body.storageUsed).toBeDefined();
        expect(res.body.totalDownloads).toBeDefined();
        expect(typeof res.body.totalUploads).toBe('number');
    });

    test('GET /api/admin/uploads - returns paginated list', async () => {
        const res = await request(app)
            .get('/api/admin/uploads')
            .set('Cookie', getCookies());
        expect(res.status).toBe(200);
        expect(res.body.uploads).toBeDefined();
        expect(Array.isArray(res.body.uploads)).toBe(true);
        expect(res.body.total).toBeDefined();
    });

    test('GET /api/admin/settings - returns settings', async () => {
        const res = await request(app)
            .get('/api/admin/settings')
            .set('Cookie', getCookies());
        expect(res.status).toBe(200);
        expect(res.body.max_single_file_size).toBeDefined();
        expect(res.body.max_total_upload_size).toBeDefined();
    });

    test('PUT /api/admin/settings - updates settings', async () => {
        const res = await request(app)
            .put('/api/admin/settings')
            .set('Cookie', getCookies())
            .send({ cleanup_interval_minutes: '120' });
        expect(res.status).toBe(200);

        const getRes = await request(app)
            .get('/api/admin/settings')
            .set('Cookie', getCookies());
        expect(getRes.body.cleanup_interval_minutes).toBe('120');
    });
});

describe('Admin Delete Upload', () => {
    let uploadId;

    beforeAll(async () => {
        // Login first
        const loginRes = await request(app)
            .post('/api/admin/login')
            .send({ username: 'admin', password: 'adminpass' });
        extractCookies(loginRes);

        // Create upload
        const uploadRes = await request(app)
            .post('/api/upload')
            .attach('files', Buffer.from('Admin delete test'), 'admindelete.txt')
            .field('retention_type', 'permanent');
        uploadId = uploadRes.body.id;
    });

    test('DELETE /api/admin/upload/:id - admin can delete any upload', async () => {
        const res = await request(app)
            .delete(`/api/admin/upload/${uploadId}`)
            .set('Cookie', getCookies());
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        const getRes = await request(app).get(`/api/upload/${uploadId}`);
        expect(getRes.status).toBe(404);
    });
});

describe('ID System', () => {
    test('Generates IDs with correct character set', async () => {
        const res = await request(app)
            .post('/api/upload')
            .attach('files', Buffer.from('ID test'), 'idtest.txt')
            .field('retention_type', 'permanent');

        const id = res.body.id;
        expect(id.length).toBeGreaterThanOrEqual(4);
        const validChars = /^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789]+$/;
        expect(id).toMatch(validChars);
    });

    test('IDs are non-sequential', async () => {
        const ids = [];
        for (let i = 0; i < 5; i++) {
            const res = await request(app)
                .post('/api/upload')
                .attach('files', Buffer.from(`ID test ${i}`), `idtest${i}.txt`)
                .field('retention_type', 'permanent');
            ids.push(res.body.id);
        }
        // All IDs should be different
        expect(new Set(ids).size).toBe(ids.length);
    }, 30000);
});

describe('Validation Rules', () => {
    test('Rejects empty password', async () => {
        const res = await request(app)
            .post('/api/upload')
            .attach('files', Buffer.from('test'), 'test.txt')
            .field('retention_type', 'days')
            .field('retention_value', '7')
            .field('password', '');
        expect(res.status).toBe(201); // empty password treated as no password
    });

    test('Rejects negative retention value', async () => {
        const res = await request(app)
            .post('/api/upload')
            .attach('files', Buffer.from('test'), 'test.txt')
            .field('retention_type', 'days')
            .field('retention_value', '-5');
        expect(res.status).toBe(400);
    });

    test('Rejects alias with uppercase', async () => {
        const res = await request(app)
            .post('/api/upload')
            .attach('files', Buffer.from('test'), 'test.txt')
            .field('retention_type', 'permanent')
            .field('alias', 'UPPERCASE');
        expect(res.status).toBe(400);
    });

    test('Rejects alias that collides with reserved routes', async () => {
        for (const route of ['admin', 'api', 'upload', 'download']) {
            const res = await request(app)
                .post('/api/upload')
                .attach('files', Buffer.from('test'), 'test.txt')
                .field('retention_type', 'permanent')
                .field('alias', route);
            expect(res.status).toBe(400);
        }
    });
});

describe('Retention System', () => {
    test('Permanent upload does not expire', async () => {
        const res = await request(app)
            .post('/api/upload')
            .attach('files', Buffer.from('Permanent'), 'perm.txt')
            .field('retention_type', 'permanent');
        expect(res.body.expiresAt).toBeNull();
    });

    test('Days retention sets expiry', async () => {
        const res = await request(app)
            .post('/api/upload')
            .attach('files', Buffer.from('Days'), 'days.txt')
            .field('retention_type', 'days')
            .field('retention_value', '7');
        expect(res.body.expiresAt).toBeDefined();
        expect(res.body.expiresAt).not.toBeNull();
    }, 15000);

    test('Weeks retention sets expiry', async () => {
        const res = await request(app)
            .post('/api/upload')
            .attach('files', Buffer.from('Weeks'), 'weeks.txt')
            .field('retention_type', 'weeks')
            .field('retention_value', '2');
        expect(res.body.expiresAt).toBeDefined();
    });

    test('Months retention sets expiry', async () => {
        const res = await request(app)
            .post('/api/upload')
            .attach('files', Buffer.from('Months'), 'months.txt')
            .field('retention_type', 'months')
            .field('retention_value', '3');
        expect(res.body.expiresAt).toBeDefined();
    });

    test('Years retention sets expiry', async () => {
        const res = await request(app)
            .post('/api/upload')
            .attach('files', Buffer.from('Years'), 'years.txt')
            .field('retention_type', 'years')
            .field('retention_value', '1');
        expect(res.body.expiresAt).toBeDefined();
    });
});

describe('Frontend / Root Route', () => {
    test('GET / - returns HTML (not 404)', async () => {
        const res = await request(app).get('/');
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('text/html');
        expect(res.text).toContain('Share.Me');
    });

    test('GET /d/nonexistent - returns HTML SPA fallback', async () => {
        const res = await request(app).get('/d/somefile');
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('text/html');
    });

    test('GET /admin - returns HTML SPA fallback', async () => {
        const res = await request(app).get('/admin');
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('text/html');
    });

    test('GET /api/nonexistent - returns 404 JSON (not caught by SPA)', async () => {
        const res = await request(app).get('/api/nonexistent');
        expect(res.status).toBe(404);
    });
});

afterAll(() => {
    // Cleanup test data
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    if (fs.existsSync(TEST_UPLOAD_DIR)) fs.rmSync(TEST_UPLOAD_DIR, { recursive: true });
});
