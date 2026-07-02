import { getDb } from '../db.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'share-me-dev-secret-change-in-production';

// Admin auth middleware — accepts session OR JWT with isAdmin flag
export function adminAuth(req, res, next) {
    // Session-based admin
    if (req.session && req.session.isAdmin) {
        return next();
    }
    // JWT-based admin — parse token directly
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
        try {
            const payload = jwt.verify(header.slice(7), JWT_SECRET);
            if (payload.isAdmin) {
                req.user = { id: payload.userId, username: payload.username, isAdmin: true };
                return next();
            }
        } catch {
            // Invalid token — fall through to 401
        }
    }
    return res.status(401).json({ error: 'Unauthorized' });
}

// Optional user auth — attaches user to req if valid JWT, otherwise req.user = null
export function userAuth(req, res, next) {
    req.user = null;
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return next();
    }

    const token = header.slice(7);
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.user = { id: payload.userId, username: payload.username, isAdmin: payload.isAdmin || false };
    } catch {
        // Invalid/expired token — user stays null
    }
    next();
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
