import { getDb } from '../db.js';

// Admin session auth middleware
export function adminAuth(req, res, next) {
    if (req.session && req.session.isAdmin) {
        return next();
    }
    return res.status(401).json({ error: 'Unauthorized' });
}

// Delete token auth - checks cookie hash against DB
export async function deleteTokenAuth(req, res, next) {
    const token = req.cookies?.delete_token;
    if (!token) {
        req.deleteTokenValid = false;
        return next();
    }

    const uploadId = req.params.id;
    if (!uploadId) {
        req.deleteTokenValid = false;
        return next();
    }

    try {
        const bcrypt = await import('bcryptjs');
        const db = getDb();
        const result = await db.execute({
            sql: 'SELECT delete_token_hash FROM uploads WHERE id = ? AND deleted = 0',
            args: [uploadId],
        });

        if (result.rows.length === 0) {
            req.deleteTokenValid = false;
            return next();
        }

        const valid = await bcrypt.default.compare(token, result.rows[0].delete_token_hash);
        req.deleteTokenValid = valid;
    } catch (e) {
        req.deleteTokenValid = false;
    }

    next();
}
