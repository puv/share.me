import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

import crypto from 'crypto';

import { initDb } from './db.js';
import uploadRoutes from './routes/upload.js';
import downloadRoutes from './routes/download.js';
import adminRoutes from './routes/admin.js';
import { startCleanupJob } from './utils/cleanup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
// Auto-generate a random 128-char hex string on startup
const SESSION_SECRET = crypto.randomBytes(64).toString('hex');

const app = express();

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
}));

// API routes
app.use('/api/upload', uploadRoutes);
app.use('/api/file', downloadRoutes);
app.use('/api/admin', adminRoutes);

// Serve frontend static files
// Docker: /app/src/../frontend/dist → /app/frontend/dist
// Local dev: backend/src/../../frontend/dist → frontend/dist
const frontendDistDocker = path.join(__dirname, '..', 'frontend', 'dist');
const frontendDistLocal = path.join(__dirname, '..', '..', 'frontend', 'dist');
const frontendDist = fs.existsSync(frontendDistDocker) ? frontendDistDocker : frontendDistLocal;

if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
}

// SPA fallback — always registered so / returns something even without a build
app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'Not found' });
    }
    const indexPath = path.join(frontendDist, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(200).contentType('text/html').send(
            '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Share.Me</title></head>' +
            '<body style="font-family:sans-serif;padding:40px;"><h1>Share.Me</h1>' +
            '<p>Frontend not built. Run <code>npm run build</code> in the frontend directory, or start the Vite dev server.</p>' +
            '</body></html>'
        );
    }
});

// Initialize and start
async function start() {
    try {
        await initDb();
        console.log('Database initialized');

        startCleanupJob();
        console.log('Cleanup job started');

        app.listen(PORT, () => {
            console.log(`Share.Me server running on http://localhost:${PORT}`);
        });
    } catch (e) {
        console.error('Failed to start server:', e);
        process.exit(1);
    }
}

start();

export default app;
