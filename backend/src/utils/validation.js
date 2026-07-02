const VALID_RETENTION_TYPES = ['one_download', 'days', 'weeks', 'months', 'years', 'permanent'];

export function validateUploadBody(body) {
    const errors = [];

    // Retention type
    if (!body.retention_type || !VALID_RETENTION_TYPES.includes(body.retention_type)) {
        errors.push('Invalid or missing retention_type. Must be one of: ' + VALID_RETENTION_TYPES.join(', '));
    }

    // Retention value for time-based
    if (['days', 'weeks', 'months', 'years'].includes(body.retention_type)) {
        const val = parseInt(body.retention_value, 10);
        if (!val || val < 1 || val > 36500) {
            errors.push('retention_value must be a positive integer (max 36500 days / ~100 years)');
        }
    }

    // Password
    if (body.password !== undefined && body.password !== '') {
        if (typeof body.password !== 'string' || body.password.length < 1 || body.password.length > 128) {
            errors.push('Password must be between 1 and 128 characters');
        }
    }

    // Alias
    if (body.alias !== undefined && body.alias !== '') {
        if (typeof body.alias !== 'string') {
            errors.push('Alias must be a string');
        }
    }

    return errors;
}

export function validatePassword(password) {
    if (!password || typeof password !== 'string') return false;
    if (password.length < 1 || password.length > 128) return false;
    return true;
}

export function sanitizeFilename(name) {
    // Remove path separators and null bytes
    let clean = name.replace(/[\x00\/\\:*?"<>|]/g, '_');
    // Trim and limit length
    clean = clean.trim().substring(0, 255);
    if (!clean) clean = 'unnamed_file';
    return clean;
}
