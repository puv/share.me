import crypto from 'crypto';

const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const RESERVED_ROUTES = ['admin', 'api', 'upload', 'download', 'file', 'd', 'qr', 'zip'];

function generateId(length) {
    const bytes = crypto.randomBytes(length * 2);
    let result = '';
    for (let i = 0; i < length; i++) {
        result += CHARSET[bytes[i] % CHARSET.length];
    }
    return result;
}

export async function generateUniqueId(db, table, column = 'id') {
    let length = 4;
    let attempts = 0;
    const maxAttempts = 10;

    while (true) {
        const id = generateId(length);
        const result = await db.execute({
            sql: `SELECT 1 FROM ${table} WHERE ${column} = ?`,
            args: [id],
        });

        if (result.rows.length === 0) {
            return id;
        }

        attempts++;
        if (attempts >= maxAttempts) {
            length++;
            attempts = 0;
        }
    }
}

export function generateDeleteToken() {
    return crypto.randomBytes(32).toString('hex');
}

export function validateAlias(alias) {
    if (!alias || typeof alias !== 'string') return false;
    if (alias.length > 40) return false;
    if (!/^[a-z0-9\-_]+$/.test(alias)) return false;
    if (RESERVED_ROUTES.includes(alias.toLowerCase())) return false;
    return true;
}
