import fs from 'fs';
import path from 'path';
import { getDb } from '../db.js';

let cleanupInterval = null;

async function getSetting(db, key) {
    const result = await db.execute({
        sql: 'SELECT value FROM settings WHERE key = ?',
        args: [key],
    });
    return result.rows[0]?.value || null;
}

async function getUploadDir(db) {
    // Respect admin setting if configured
    const dir = await getSetting(db, 'upload_directory');
    if (dir) return dir;
    // Production Docker path
    if (fs.existsSync('/app')) return '/app/uploads';
    // Local dev fallback
    return path.join(process.cwd(), 'uploads');
}

export async function runCleanup() {
    const db = getDb();
    const uploadDir = await getUploadDir(db);

    // Find expired uploads
    const now = new Date().toISOString();
    const result = await db.execute({
        sql: `SELECT id FROM uploads
          WHERE deleted = 0
          AND expires_at IS NOT NULL
          AND expires_at <= ?`,
        args: [now],
    });

    for (const row of result.rows) {
        await deleteUploadFiles(row.id, uploadDir);
        await db.execute({
            sql: 'UPDATE uploads SET deleted = 1 WHERE id = ?',
            args: [row.id],
        });
    }
}

export async function deleteUploadFiles(uploadId, uploadDir) {
    const db = getDb();
    const result = await db.execute({
        sql: 'SELECT stored_name FROM files WHERE upload_id = ?',
        args: [uploadId],
    });

    for (const row of result.rows) {
        const filePath = path.join(uploadDir, row.stored_name);
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        } catch (e) {
            // Ignore errors on file deletion
        }
    }
}

export function startCleanupJob() {
    const intervalMinutes = parseInt(process.env.CLEANUP_INTERVAL || '60', 10);
    const ms = intervalMinutes * 60 * 1000;

    cleanupInterval = setInterval(async () => {
        try {
            await runCleanup();
        } catch (e) {
            console.error('Cleanup job error:', e.message);
        }
    }, ms);

    // Run once at startup
    runCleanup().catch(e => console.error('Initial cleanup error:', e.message));
}

export function stopCleanupJob() {
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
    }
}
