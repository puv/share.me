import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { getDb } from '../db.js';

const router = Router();

// GET /api/file/:fileId - download single file
router.get('/:fileId', async (req, res) => {
    try {
        const db = getDb();
        const { fileId } = req.params;

        const fileResult = await db.execute({
            sql: `SELECT f.*, u.password_hash, u.retention_type, u.download_count as upload_downloads, u.deleted
            FROM files f
            JOIN uploads u ON f.upload_id = u.id
            WHERE f.id = ? AND u.deleted = 0`,
            args: [fileId],
        });

        if (fileResult.rows.length === 0) {
            return res.status(404).json({ error: 'File not found' });
        }

        const file = fileResult.rows[0];

        // Check password session
        if (file.password_hash) {
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
            if (sessionData.uploadId !== file.upload_id) {
                return res.status(401).json({ error: 'Invalid session' });
            }
        }

        const uploadDir = fs.existsSync('/app') ? '/app/uploads' : path.join(process.cwd(), 'uploads');
        const filePath = path.join(uploadDir, file.stored_name);

        // Prevent directory traversal
        if (!filePath.startsWith(uploadDir)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found on disk' });
        }

        // Increment download counts
        await db.execute({
            sql: 'UPDATE files SET download_count = download_count + 1 WHERE id = ?',
            args: [file.id],
        });
        await db.execute({
            sql: 'UPDATE uploads SET download_count = download_count + 1 WHERE id = ?',
            args: [file.upload_id],
        });

        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.original_name)}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Length', file.size);

        const stream = fs.createReadStream(filePath);
        stream.pipe(res);

        stream.on('error', (err) => {
            console.error('File stream error:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'File read error' });
            }
        });

        // Handle one_download after successful download
        res.on('finish', async () => {
            if (file.retention_type === 'one_download') {
                try {
                    const { deleteUploadFiles } = await import('../utils/cleanup.js');
                    await deleteUploadFiles(file.upload_id, uploadDir);
                    await db.execute({
                        sql: 'UPDATE uploads SET deleted = 1 WHERE id = ?',
                        args: [file.upload_id],
                    });
                } catch (e) {
                    console.error('One-download cleanup error:', e);
                }
            }
        });
    } catch (e) {
        console.error('File download error:', e);
        res.status(500).json({ error: 'File download failed' });
    }
});

export default router;
