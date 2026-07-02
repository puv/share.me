import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

function getUploadDir() {
    // Production Docker path
    const prod = '/app/uploads';
    if (fs.existsSync('/app')) {
        if (!fs.existsSync(prod)) fs.mkdirSync(prod, { recursive: true });
        return prod;
    }
    // Local dev fallback
    const dir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, getUploadDir());
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const name = crypto.randomBytes(16).toString('hex') + ext;
        cb(null, name);
    },
});

export const upload = multer({
    storage,
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE || '1073741824', 10), // 1GB default
        files: 20,
    },
});
