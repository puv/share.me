import { Router } from 'express';
import { adminAuth } from '../middleware/auth.js';
import { getDb } from '../db.js';
import path from 'path';
import fs from 'fs';

const router = Router();

// POST /api/admin/login
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    const adminUser = process.env.ADMIN_USERNAME;
    const adminPass = process.env.ADMIN_PASSWORD;

    if (!adminUser || !adminPass) {
        return res.status(500).json({ error: 'Admin credentials not configured' });
    }

    if (username === adminUser && password === adminPass) {
        req.session.isAdmin = true;
        return res.json({ success: true });
    }

    res.status(401).json({ error: 'Invalid credentials' });
});

// POST /api/admin/logout
router.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// GET /api/admin/check
router.get('/check', (req, res) => {
    res.json({ isAdmin: !!req.session?.isAdmin });
});

// GET /api/admin/stats
router.get('/stats', adminAuth, async (req, res) => {
    try {
        const db = getDb();

        const totalResult = await db.execute('SELECT COUNT(*) as count FROM uploads');
        const activeResult = await db.execute("SELECT COUNT(*) as count FROM uploads WHERE deleted = 0 AND (expires_at IS NULL OR expires_at > datetime('now'))");
        const expiredResult = await db.execute("SELECT COUNT(*) as count FROM uploads WHERE deleted = 1 OR (expires_at IS NOT NULL AND expires_at <= datetime('now'))");
        const downloadsResult = await db.execute('SELECT COALESCE(SUM(download_count), 0) as total FROM uploads');

        const filesResult = await db.execute(`
      SELECT COALESCE(SUM(f.size), 0) as total_size
      FROM files f
      JOIN uploads u ON f.upload_id = u.id
      WHERE u.deleted = 0
    `);

        res.json({
            totalUploads: totalResult.rows[0].count,
            activeUploads: activeResult.rows[0].count,
            expiredUploads: expiredResult.rows[0].count,
            storageUsed: filesResult.rows[0].total_size,
            totalDownloads: downloadsResult.rows[0].total,
        });
    } catch (e) {
        console.error('Admin stats error:', e);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// GET /api/admin/uploads
router.get('/uploads', adminAuth, async (req, res) => {
    try {
        const db = getDb();
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;

        const countResult = await db.execute('SELECT COUNT(*) as count FROM uploads');
        const total = countResult.rows[0].count;

        const result = await db.execute(`
      SELECT
        u.*,
        COUNT(f.id) as file_count,
        COALESCE(SUM(f.size), 0) as total_size
      FROM uploads u
      LEFT JOIN files f ON f.upload_id = u.id
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

        const rows = result.rows.map(row => ({
            ...row,
            hasPassword: !!row.password_hash,
            password_hash: undefined,
            delete_token_hash: undefined,
        }));

        res.json({
            uploads: rows,
            total,
            page,
            totalPages: Math.ceil(total / limit),
        });
    } catch (e) {
        console.error('Admin uploads list error:', e);
        res.status(500).json({ error: 'Failed to fetch uploads' });
    }
});

// GET /api/admin/upload/:id - upload detail
router.get('/upload/:id', adminAuth, async (req, res) => {
    try {
        const db = getDb();
        const { id } = req.params;

        const uploadResult = await db.execute({
            sql: 'SELECT * FROM uploads WHERE id = ? OR alias = ?',
            args: [id, id],
        });

        if (uploadResult.rows.length === 0) {
            return res.status(404).json({ error: 'Upload not found' });
        }

        const upload = uploadResult.rows[0];

        const filesResult = await db.execute({
            sql: 'SELECT * FROM files WHERE upload_id = ?',
            args: [upload.id],
        });

        res.json({
            ...upload,
            hasPassword: !!upload.password_hash,
            password_hash: undefined,
            delete_token_hash: undefined,
            files: filesResult.rows,
        });
    } catch (e) {
        console.error('Admin upload detail error:', e);
        res.status(500).json({ error: 'Failed to fetch upload detail' });
    }
});

// DELETE /api/admin/upload/:id - admin delete
router.delete('/upload/:id', adminAuth, async (req, res) => {
    try {
        const db = getDb();
        const { id } = req.params;

        const result = await db.execute({
            sql: 'SELECT * FROM uploads WHERE (id = ? OR alias = ?)',
            args: [id, id],
        });

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Upload not found' });
        }

        const upload = result.rows[0];
        const uploadDir = fs.existsSync('/app') ? '/app/uploads' : path.join(process.cwd(), 'uploads');

        const { deleteUploadFiles } = await import('../utils/cleanup.js');
        await deleteUploadFiles(upload.id, uploadDir);

        await db.execute({
            sql: 'UPDATE uploads SET deleted = 1 WHERE id = ?',
            args: [upload.id],
        });

        res.json({ success: true });
    } catch (e) {
        console.error('Admin delete error:', e);
        res.status(500).json({ error: 'Delete failed' });
    }
});

// GET /api/admin/settings
router.get('/settings', adminAuth, async (req, res) => {
    try {
        const db = getDb();
        const result = await db.execute('SELECT key, value FROM settings');
        const settings = {};
        for (const row of result.rows) {
            settings[row.key] = row.value;
        }
        res.json(settings);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

// PUT /api/admin/settings
router.put('/settings', adminAuth, async (req, res) => {
    try {
        const db = getDb();
        const allowedKeys = [
            'max_single_file_size',
            'max_total_upload_size',
            'max_retention_allowed',
            'cleanup_interval_minutes',
        ];

        for (const [key, value] of Object.entries(req.body)) {
            if (!allowedKeys.includes(key)) continue;
            await db.execute({
                sql: 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
                args: [key, String(value)],
            });
        }

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

export default router;
