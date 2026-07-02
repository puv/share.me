import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_UPLOAD_DIR = path.join(__dirname, '..', 'data', 'test-uploads-auth');
const TEST_DB_PATH = path.join(__dirname, '..', 'data', 'test-auth.db');

process.env.UPLOAD_DIRECTORY = TEST_UPLOAD_DIR;
process.env.DATABASE_PATH = TEST_DB_PATH;
process.env.JWT_SECRET = 'test-jwt-secret-auth-tests';
process.env.SESSION_SECRET = 'test-session-' + crypto.randomBytes(16).toString('hex');
process.env.PORT = '0';

// Clean up BEFORE importing the app (so initDb starts fresh)
if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
if (fs.existsSync(TEST_UPLOAD_DIR)) fs.rmSync(TEST_UPLOAD_DIR, { recursive: true });
fs.mkdirSync(TEST_UPLOAD_DIR, { recursive: true });

const { default: app } = await import('../src/index.js');

let authToken = null;

describe('Auth API — Register', () => {
    test('creates a new user and returns token', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ username: 'testuser', password: 'password123' });
        expect(res.status).toBe(201);
        expect(res.body.token).toBeDefined();
        expect(res.body.user.username).toBe('testuser');
        expect(res.body.user.maxUploadSize).toBe(1073741824);
        authToken = res.body.token;
    });

    test('rejects duplicate username', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ username: 'testuser', password: 'password456' });
        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/taken/i);
    });

    test('rejects short username', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ username: 'ab', password: 'password123' });
        expect(res.status).toBe(400);
    });

    test('rejects short password', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ username: 'validuser', password: '12345' });
        expect(res.status).toBe(400);
    });

    test('rejects invalid username characters', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ username: 'bad user!', password: 'password123' });
        expect(res.status).toBe(400);
    });
});

describe('Auth API — Login', () => {
    test('logs in with valid credentials', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ username: 'testuser', password: 'password123' });
        expect(res.status).toBe(200);
        expect(res.body.token).toBeDefined();
        expect(res.body.user.username).toBe('testuser');
        authToken = res.body.token;
    });

    test('rejects wrong password', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ username: 'testuser', password: 'wrongpass' });
        expect(res.status).toBe(401);
    });

    test('rejects non-existent user', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ username: 'nobody', password: 'password123' });
        expect(res.status).toBe(401);
    });

    test('rejects missing fields', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ username: 'testuser' });
        expect(res.status).toBe(400);
    });
});

describe('Auth API — Get Me', () => {
    test('returns user info with valid token', async () => {
        const res = await request(app)
            .get('/api/auth/me')
            .set('Authorization', 'Bearer ' + authToken);
        expect(res.status).toBe(200);
        expect(res.body.username).toBe('testuser');
        expect(res.body.maxUploadSize).toBe(1073741824);
    });

    test('rejects without token', async () => {
        const res = await request(app).get('/api/auth/me');
        expect(res.status).toBe(401);
    });

    test('rejects with invalid token', async () => {
        const res = await request(app)
            .get('/api/auth/me')
            .set('Authorization', 'Bearer invalid-token-here');
        expect(res.status).toBe(401);
    });
});

describe('Upload Size Limits', () => {
    test('guest upload rejected over 50 MB', async () => {
        const bigSize = 51 * 1024 * 1024;
        const bigBuffer = Buffer.alloc(bigSize, 'x');
        const res = await request(app)
            .post('/api/upload')
            .attach('files', bigBuffer, 'huge.bin')
            .field('retention_type', 'permanent');
        expect(res.status).toBe(413);
        expect(res.body.error).toMatch(/50 MB/);
    });

    test('guest can upload under 50 MB', async () => {
        const res = await request(app)
            .post('/api/upload')
            .attach('files', Buffer.from('small file'), 'small.txt')
            .field('retention_type', 'permanent');
        expect(res.status).toBe(201);
    });

    test('authenticated user upload passes with token', async () => {
        const res = await request(app)
            .post('/api/upload')
            .set('Authorization', 'Bearer ' + authToken)
            .attach('files', Buffer.from('user file'), 'userfile.txt')
            .field('retention_type', 'permanent');
        expect(res.status).toBe(201);
        expect(res.body.id).toBeDefined();
    });
});

describe('Admin JWT Auth', () => {
    let adminToken;

    beforeAll(async () => {
        process.env.ADMIN_USERNAME = 'admin';
        process.env.ADMIN_PASSWORD = 'adminpass';
        const res = await request(app)
            .post('/api/auth/login')
            .send({ username: 'admin', password: 'adminpass' });
        expect(res.status).toBe(200);
        expect(res.body.user.isAdmin).toBe(true);
        adminToken = res.body.token;
    });

    test('GET /api/admin/check returns isAdmin true with JWT', async () => {
        const res = await request(app)
            .get('/api/admin/check')
            .set('Authorization', 'Bearer ' + adminToken);
        expect(res.status).toBe(200);
        expect(res.body.isAdmin).toBe(true);
    });

    test('GET /api/admin/check returns false without token', async () => {
        const res = await request(app).get('/api/admin/check');
        expect(res.status).toBe(200);
        expect(res.body.isAdmin).toBe(false);
    });

    test('GET /api/admin/stats succeeds with admin JWT', async () => {
        const res = await request(app)
            .get('/api/admin/stats')
            .set('Authorization', 'Bearer ' + adminToken);
        expect(res.status).toBe(200);
        expect(res.body.totalUploads).toBeDefined();
    });

    test('GET /api/admin/stats fails without token', async () => {
        const res = await request(app).get('/api/admin/stats');
        expect(res.status).toBe(401);
    });

    test('GET /api/admin/stats fails with regular user JWT', async () => {
        const regRes = await request(app)
            .post('/api/auth/register')
            .send({ username: 'regularuser', password: 'password123' });
        const userToken = regRes.body.token;

        const res = await request(app)
            .get('/api/admin/stats')
            .set('Authorization', 'Bearer ' + userToken);
        expect(res.status).toBe(401);
    });

    test('GET /api/admin/settings succeeds with admin JWT', async () => {
        const res = await request(app)
            .get('/api/admin/settings')
            .set('Authorization', 'Bearer ' + adminToken);
        expect(res.status).toBe(200);
    });

    test('PUT /api/admin/settings succeeds with admin JWT', async () => {
        const res = await request(app)
            .put('/api/admin/settings')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({ guest_max_upload_size: '104857600' });
        expect(res.status).toBe(200);

        const getRes = await request(app)
            .get('/api/admin/settings')
            .set('Authorization', 'Bearer ' + adminToken);
        expect(getRes.body.guest_max_upload_size).toBe('104857600');
    });
});
