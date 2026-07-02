import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getDb } from '../db.js';
import { userAuth } from '../middleware/auth.js';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'share-me-dev-secret-change-in-production';
const JWT_EXPIRES_IN = '7d';

function generateToken(user, isAdmin = false) {
    return jwt.sign(
        { userId: user.id, username: user.username, isAdmin },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || typeof username !== 'string' || username.trim().length < 3 || username.trim().length > 30) {
            return res.status(400).json({ error: 'Username must be 3–30 characters' });
        }
        if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
            return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores' });
        }
        if (!password || typeof password !== 'string' || password.length < 6 || password.length > 128) {
            return res.status(400).json({ error: 'Password must be 6–128 characters' });
        }

        const db = getDb();
        const cleanUsername = username.trim();

        const existing = await db.execute({
            sql: 'SELECT id FROM users WHERE username = ?',
            args: [cleanUsername],
        });
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'Username already taken' });
        }

        const userId = crypto.randomBytes(12).toString('hex');
        const passwordHash = await bcrypt.hash(password, 12);

        await db.execute({
            sql: 'INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)',
            args: [userId, cleanUsername, passwordHash],
        });

        const user = { id: userId, username: cleanUsername };
        const token = generateToken(user);

        res.status(201).json({
            token,
            user: {
                id: userId,
                username: cleanUsername,
                maxUploadSize: 1073741824,
            },
        });
    } catch (e) {
        console.error('Register error:', e);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        // Check admin credentials first
        const adminUser = process.env.ADMIN_USERNAME;
        const adminPass = process.env.ADMIN_PASSWORD;
        if (adminUser && adminPass && username === adminUser && password === adminPass) {
            const token = generateToken({ id: 'admin', username: adminUser }, true);
            return res.json({
                token,
                user: {
                    id: 'admin',
                    username: adminUser,
                    maxUploadSize: 1073741824,
                    isAdmin: true,
                },
            });
        }

        const db = getDb();
        const result = await db.execute({
            sql: 'SELECT id, username, password_hash, max_upload_size FROM users WHERE username = ?',
            args: [username.trim()],
        });

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const user = result.rows[0];
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const token = generateToken({ id: user.id, username: user.username });

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                maxUploadSize: user.max_upload_size,
            },
        });
    } catch (e) {
        console.error('Login error:', e);
        res.status(500).json({ error: 'Login failed' });
    }
});

// GET /api/auth/me
router.get('/me', userAuth, async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    // Admin user from env vars
    if (req.user.isAdmin || req.user.id === 'admin') {
        return res.json({
            id: 'admin',
            username: req.user.username,
            maxUploadSize: 1073741824,
            isAdmin: true,
        });
    }
    try {
        const db = getDb();
        const result = await db.execute({
            sql: 'SELECT id, username, max_upload_size, created_at FROM users WHERE id = ?',
            args: [req.user.id],
        });

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = result.rows[0];
        res.json({
            id: user.id,
            username: user.username,
            maxUploadSize: user.max_upload_size,
            createdAt: user.created_at,
        });
    } catch (e) {
        console.error('Get me error:', e);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

export default router;
