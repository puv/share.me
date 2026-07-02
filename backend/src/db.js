import { createClient } from '@libsql/client';
import path from 'path';
import fs from 'fs';

const DB_PATH = (() => {
  // Allow override via env var (for tests)
  if (process.env.DATABASE_PATH) return process.env.DATABASE_PATH;
  // Production Docker path
  const prod = '/app/config/shareme.db';
  if (fs.existsSync('/app/config')) return prod;
  // Local dev fallback
  return path.join(process.cwd(), 'config', 'shareme.db');
})();

let client = null;

export function getDb() {
  if (!client) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    client = createClient({
      url: `file:${DB_PATH}`,
    });
  }
  return client;
}

export async function initDb() {
  const db = getDb();

  await db.execute(`
    CREATE TABLE IF NOT EXISTS uploads (
      id TEXT PRIMARY KEY,
      alias TEXT UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT,
      retention_type TEXT NOT NULL,
      retention_value INTEGER,
      password_hash TEXT,
      delete_token_hash TEXT NOT NULL,
      download_count INTEGER NOT NULL DEFAULT 0,
      deleted INTEGER NOT NULL DEFAULT 0
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      upload_id TEXT NOT NULL,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      size INTEGER NOT NULL,
      download_count INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      max_upload_size INTEGER NOT NULL DEFAULT 1073741824
    )
  `);

  // Add user_id column to uploads if it doesn't exist (migration-safe)
  try {
    await db.execute(`ALTER TABLE uploads ADD COLUMN user_id TEXT REFERENCES users(id)`);
  } catch {
    // Column already exists — ignore
  }

  // Default settings
  const defaults = {
    max_single_file_size: '1073741824', // 1GB
    max_total_upload_size: '5368709120', // 5GB
    max_retention_allowed: 'permanent',
    cleanup_interval_minutes: '60',
    guest_max_upload_size: '52428800', // 50 MB
    user_max_upload_size: '1073741824', // 1 GB
    guest_max_retention: 'permanent',
    user_max_retention: 'permanent',
  };

  for (const [key, value] of Object.entries(defaults)) {
    await db.execute({
      sql: 'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
      args: [key, value],
    });
  }

  return db;
}
