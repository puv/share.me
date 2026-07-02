import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { getDb, initDb } from '../db.js';
import { upload } from '../middleware/upload.js';
import { generateUniqueId, generateDeleteToken, validateAlias } from '../utils/id.js';
import { validateUploadBody, sanitizeFilename } from '../utils/validation.js';
import { generateQrDataUrl } from '../utils/qr.js';

const router = Router();

// POST /api/upload
router.post('/', upload.array('files', 20), async (req, res) => {
    try {
        const db = getDb();

        // Validate body
        const errors = validateUploadBody(req.body);
        if (errors.length > 0) {
            return res.status(400).json({ errors });
        }

        // Validate files
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'At least one file is required' });
        }

        // Validate alias if provided
        if (req.body.alias) {
            if (!validateAlias(req.body.alias)) {
                return res.status(400).json({ error: 'Invalid alias. Use lowercase letters, numbers, hyphens, underscores. Max 40 chars.' });
            }
            const existing = await db.execute({
                sql: 'SELECT id FROM uploads WHERE alias = ? AND deleted = 0',
                args: [req.body.alias],
            });
            if (existing.rows.length > 0) {
                return res.status(409).json({ error: 'Alias already taken' });
            }
        }

        // Generate upload ID
        const uploadId = await generateUniqueId(db, 'uploads', 'id');

        // Calculate expiration
        let expiresAt = null;
        const retentionType = req.body.retention_type;
        const retentionValue = parseInt(req.body.retention_value, 10);

        if (['days', 'weeks', 'months', 'years'].includes(retentionType)) {
            const multipliers = { days: 1, weeks: 7, months: 30, years: 365 };
            const days = retentionValue * (multipliers[retentionType] || 1);
            const expiry = new Date();
            expiry.setDate(expiry.getDate() + days);
            expiresAt = expiry.toISOString();
        }
        // one_download and permanent have null expires_at

        // Hash password if provided
        let passwordHash = null;
        if (req.body.password) {
            passwordHash = await bcrypt.hash(req.body.password, 12);
        }

        // Generate delete token
        const deleteToken = generateDeleteToken();
        const deleteTokenHash = await bcrypt.hash(deleteToken, 12);

        // Insert upload record
        await db.execute({
            sql: `INSERT INTO uploads (id, alias, retention_type, retention_value, password_hash, delete_token_hash, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            args: [uploadId, req.body.alias || null, retentionType, retentionValue || null, passwordHash, deleteTokenHash, expiresAt],
        });

        // Insert file records
        for (const file of req.files) {
            const fileId = crypto.randomBytes(8).toString('hex');
            const originalName = sanitizeFilename(file.originalname);
            await db.execute({
                sql: `INSERT INTO files (id, upload_id, original_name, stored_name, size)
              VALUES (?, ?, ?, ?, ?)`,
                args: [fileId, uploadId, originalName, file.filename, file.size],
            });
        }

        // Set delete token cookie
        res.cookie('delete_token', deleteToken, {
            httpOnly: true,
            sameSite: 'lax',
            maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
            path: '/',
        });

        // Generate QR code
        const shareUrl = `${req.protocol}://${req.get('host')}/d/${uploadId}`;
        let qrDataUrl = null;
        try {
            qrDataUrl = await generateQrDataUrl(shareUrl);
        } catch (e) {
            // QR generation failure is non-fatal
        }

        const sharePath = req.body.alias ? `/d/${req.body.alias}` : `/d/${uploadId}`;

        res.status(201).json({
            id: uploadId,
            alias: req.body.alias || null,
            shareUrl: `${req.protocol}://${req.get('host')}${sharePath}`,
            sharePath,
            expiresAt,
            retentionType,
            qrCode: qrDataUrl,
            fileCount: req.files.length,
        });
    } catch (e) {
        console.error('Upload error:', e);
        res.status(500).json({ error: 'Upload failed' });
    }
});

// GET /api/upload/:id - get upload metadata (no password protected fields)
router.get('/:id', async (req, res) => {
    try {
        const db = getDb();
        const id = req.params.id;

        // Look up by ID or alias
        const uploadResult = await db.execute({
            sql: `SELECT * FROM uploads WHERE (id = ? OR alias = ?) AND deleted = 0`,
            args: [id, id],
        });

        if (uploadResult.rows.length === 0) {
            return res.status(404).json({ error: 'Upload not found or expired' });
        }

        const upload = uploadResult.rows[0];

        // Check expiration
        if (upload.expires_at && new Date(upload.expires_at) <= new Date()) {
            return res.status(404).json({ error: 'Upload has expired' });
        }

        // Check one_download
        if (upload.retention_type === 'one_download' && upload.download_count >= 1) {
            return res.status(404).json({ error: 'Upload has expired' });
        }

        const hasPassword = !!upload.password_hash;

        // Files list only if no password
        let files = [];
        if (!hasPassword) {
            const filesResult = await db.execute({
                sql: 'SELECT id, original_name, size FROM files WHERE upload_id = ?',
                args: [upload.id],
            });
            files = filesResult.rows;
        }

        // Check if requester is the owner (has matching delete token)
        let isOwner = false;
        const token = req.cookies?.delete_token;
        if (token && upload.delete_token_hash) {
            try {
                isOwner = await bcrypt.compare(token, upload.delete_token_hash);
            } catch (e) {
                isOwner = false;
            }
        }

        res.json({
            id: upload.id,
            alias: upload.alias,
            created_at: upload.created_at,
            expires_at: upload.expires_at,
            retention_type: upload.retention_type,
            retention_value: upload.retention_value,
            hasPassword,
            download_count: upload.download_count,
            files,
            isOwner,
        });
    } catch (e) {
        console.error('Get upload error:', e);
        res.status(500).json({ error: 'Failed to fetch upload' });
    }
});

// POST /api/upload/:id/password - verify password
router.post('/:id/password', async (req, res) => {
    try {
        const db = getDb();
        const id = req.params.id;
        const { password } = req.body;

        if (!password) {
            return res.status(400).json({ error: 'Password is required' });
        }

        const result = await db.execute({
            sql: `SELECT * FROM uploads WHERE (id = ? OR alias = ?) AND deleted = 0`,
            args: [id, id],
        });

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Upload not found' });
        }

        const upload = result.rows[0];

        if (!upload.password_hash) {
            return res.status(400).json({ error: 'Upload is not password protected' });
        }

        const valid = await bcrypt.compare(password, upload.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Incorrect password' });
        }

        // Return full metadata
        const filesResult = await db.execute({
            sql: 'SELECT id, original_name, size FROM files WHERE upload_id = ?',
            args: [upload.id],
        });

        // Set a session token for this upload
        const sessionToken = crypto.randomBytes(16).toString('hex');
        await db.execute({
            sql: `INSERT INTO sessions (id, data, expires_at) VALUES (?, ?, datetime('now', '+1 hour'))`,
            args: [sessionToken, JSON.stringify({ uploadId: upload.id })],
        });

        res.cookie('upload_session', sessionToken, {
            httpOnly: true,
            sameSite: 'lax',
            maxAge: 60 * 60 * 1000, // 1 hour
            path: '/',
        });

        // Check if requester is the owner
        let isOwner = false;
        const deleteToken = req.cookies?.delete_token;
        if (deleteToken && upload.delete_token_hash) {
            try {
                isOwner = await bcrypt.compare(deleteToken, upload.delete_token_hash);
            } catch (e) {
                isOwner = false;
            }
        }

        res.json({
            id: upload.id,
            alias: upload.alias,
            created_at: upload.created_at,
            expires_at: upload.expires_at,
            retention_type: upload.retention_type,
            retention_value: upload.retention_value,
            hasPassword: true,
            download_count: upload.download_count,
            files: filesResult.rows,
            isOwner,
        });
    } catch (e) {
        console.error('Password verify error:', e);
        res.status(500).json({ error: 'Password verification failed' });
    }
});

// GET /api/upload/:id/qr - get QR code as PNG
router.get('/:id/qr', async (req, res) => {
    try {
        const db = getDb();
        const id = req.params.id;

        const result = await db.execute({
            sql: 'SELECT id, alias FROM uploads WHERE (id = ? OR alias = ?) AND deleted = 0',
            args: [id, id],
        });

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Upload not found' });
        }

        const upload = result.rows[0];
        const shareUrl = `${req.protocol}://${req.get('host')}/d/${upload.alias || upload.id}`;

        const { generateQrPngBuffer } = await import('../utils/qr.js');
        const pngBuffer = await generateQrPngBuffer(shareUrl);

        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Content-Disposition', `attachment; filename="shareme-qr-${upload.alias || upload.id}.png"`);
        res.send(pngBuffer);
    } catch (e) {
        console.error('QR error:', e);
        res.status(500).json({ error: 'QR code generation failed' });
    }
});

// GET /api/upload/:id/zip - stream ZIP download
router.get('/:id/zip', async (req, res) => {
    try {
        const db = getDb();
        const id = req.params.id;

        const uploadResult = await db.execute({
            sql: `SELECT * FROM uploads WHERE (id = ? OR alias = ?) AND deleted = 0`,
            args: [id, id],
        });

        if (uploadResult.rows.length === 0) {
            return res.status(404).json({ error: 'Upload not found' });
        }

        const upload = uploadResult.rows[0];

        // Check password session
        if (upload.password_hash) {
            const sessionToken = req.cookies?.upload_session;
            if (!sessionToken) {
                return res.status(401).json({ error: 'Password required' });
            }
            const sessionResult = await db.execute({
                sql: "SELECT data FROM sessions WHERE id = ? AND expires_at > datetime('now')",
                args: [sessionToken],
            });
            if (sessionResult.rows.length === 0) {
                return res.status(401).json({ error: 'Session expired. Please re-enter password.' });
            }
            const sessionData = JSON.parse(sessionResult.rows[0].data);
            if (sessionData.uploadId !== upload.id) {
                return res.status(401).json({ error: 'Invalid session' });
            }
        }

        const filesResult = await db.execute({
            sql: 'SELECT id, original_name, stored_name, size FROM files WHERE upload_id = ?',
            args: [upload.id],
        });

        if (filesResult.rows.length === 0) {
            return res.status(404).json({ error: 'No files found' });
        }

        const uploadDir = fs.existsSync('/app') ? '/app/uploads' : path.join(process.cwd(), 'uploads');
        const { createZipStream } = await import('../utils/zip.js');

        const files = filesResult.rows;
        const archive = createZipStream(files, (storedName) => path.join(uploadDir, storedName));

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="shareme-${upload.alias || upload.id}.zip"`);

        archive.pipe(res);

        archive.on('error', (err) => {
            console.error('Zip error:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Zip generation failed' });
            }
        });

        // Increment download counts
        await db.execute({
            sql: 'UPDATE uploads SET download_count = download_count + 1 WHERE id = ?',
            args: [upload.id],
        });
        await db.execute({
            sql: 'UPDATE files SET download_count = download_count + 1 WHERE upload_id = ?',
            args: [upload.id],
        });

        // Handle one_download
        if (upload.retention_type === 'one_download') {
            archive.on('finish', async () => {
                try {
                    const { deleteUploadFiles } = await import('../utils/cleanup.js');
                    await deleteUploadFiles(upload.id, uploadDir);
                    await db.execute({
                        sql: 'UPDATE uploads SET deleted = 1 WHERE id = ?',
                        args: [upload.id],
                    });
                } catch (e) {
                    console.error('One-download cleanup error:', e);
                }
            });
        }
    } catch (e) {
        console.error('ZIP download error:', e);
        res.status(500).json({ error: 'ZIP download failed' });
    }
});

// PATCH /api/upload/:id - update upload settings (owner only)
router.patch('/:id', async (req, res) => {
    try {
        const db = getDb();
        const id = req.params.id;

        const result = await db.execute({
            sql: 'SELECT * FROM uploads WHERE (id = ? OR alias = ?) AND deleted = 0',
            args: [id, id],
        });

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Upload not found' });
        }

        const upload = result.rows[0];

        // Verify ownership via delete token
        const token = req.cookies?.delete_token;
        if (!token) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        const valid = await bcrypt.compare(token, upload.delete_token_hash);
        if (!valid) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        const updates = {};
        const { retention_type, retention_value, password, alias } = req.body;

        // Update retention
        if (retention_type) {
            const allowed = ['one_download', 'days', 'weeks', 'months', 'years', 'permanent'];
            if (!allowed.includes(retention_type)) {
                return res.status(400).json({ error: 'Invalid retention type' });
            }
            updates.retention_type = retention_type;

            if (['days', 'weeks', 'months', 'years'].includes(retention_type)) {
                const val = parseInt(retention_value, 10);
                if (!val || val < 1) {
                    return res.status(400).json({ error: 'Retention value must be a positive number' });
                }
                updates.retention_value = val;

                // Recalculate expiration
                const now = new Date();
                const multipliers = { days: 1, weeks: 7, months: 30, years: 365 };
                const days = val * (multipliers[retention_type] || 1);
                now.setDate(now.getDate() + days);
                updates.expires_at = now.toISOString();
            } else {
                updates.retention_value = null;
                updates.expires_at = null;
            }
        }

        // Update password
        if (password !== undefined) {
            if (password === '' || password === null) {
                updates.password_hash = null;
            } else {
                updates.password_hash = await bcrypt.hash(password, 10);
            }
        }

        // Update alias
        if (alias !== undefined) {
            if (alias === '' || alias === null) {
                updates.alias = null;
            } else {
                if (!validateAlias(alias)) {
                    return res.status(400).json({ error: 'Invalid alias. Use lowercase letters, numbers, hyphens, underscores. Max 40 chars.' });
                }
                const existing = await db.execute({
                    sql: 'SELECT id FROM uploads WHERE alias = ? AND id != ? AND deleted = 0',
                    args: [alias, upload.id],
                });
                if (existing.rows.length > 0) {
                    return res.status(409).json({ error: 'Alias already taken' });
                }
                updates.alias = alias;
            }
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
        const values = Object.values(updates);

        await db.execute({
            sql: `UPDATE uploads SET ${setClauses} WHERE id = ?`,
            args: [...values, upload.id],
        });

        res.json({ success: true, updated: Object.keys(updates) });
    } catch (e) {
        console.error('Update upload error:', e);
        res.status(500).json({ error: 'Update failed' });
    }
});

// DELETE /api/upload/:id - delete upload (by cookie token or admin)
router.delete('/:id', async (req, res) => {
    try {
        const db = getDb();
        const id = req.params.id;

        const result = await db.execute({
            sql: 'SELECT * FROM uploads WHERE (id = ? OR alias = ?) AND deleted = 0',
            args: [id, id],
        });

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Upload not found' });
        }

        const upload = result.rows[0];
        let authorized = false;

        // Admin session check
        if (req.session && req.session.isAdmin) {
            authorized = true;
        }

        // Delete token check
        if (!authorized) {
            const token = req.cookies?.delete_token;
            if (token) {
                const valid = await bcrypt.compare(token, upload.delete_token_hash);
                if (valid) {
                    authorized = true;
                }
            }
        }

        if (!authorized) {
            return res.status(403).json({ error: 'Not authorized to delete this upload' });
        }

        const uploadDir = fs.existsSync('/app') ? '/app/uploads' : path.join(process.cwd(), 'uploads');
        const { deleteUploadFiles } = await import('../utils/cleanup.js');
        await deleteUploadFiles(upload.id, uploadDir);

        await db.execute({
            sql: 'UPDATE uploads SET deleted = 1 WHERE id = ?',
            args: [upload.id],
        });

        res.json({ success: true });
    } catch (e) {
        console.error('Delete upload error:', e);
        res.status(500).json({ error: 'Delete failed' });
    }
});

export default router;
