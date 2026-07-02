# Share.Me

A minimal, self-hosted file sharing application. No accounts, no emails, no fuss.

Upload a file, get a shareable link. That's it.

## Quick Start

```bash
docker-compose up --build
```

The app runs on `http://localhost:3000`.

### Default Admin Credentials

- Username: `admin`
- Password: `changeme`

Change these via the `ADMIN_USERNAME` and `ADMIN_PASSWORD` environment variables.

## Features

- **Upload files** — Drag and drop or click to browse. Multiple files supported.
- **Share link** — Get a short, random URL. Optionally set a custom alias.
- **Password protection** — Optional bcrypt-hashed password required before viewing metadata.
- **Retention rules** — One download, time-based (days/weeks/months/years), or permanent.
- **QR codes** — Auto-generated QR code for each upload. Downloadable as PNG.
- **ZIP downloads** — Multi-file uploads can be downloaded as a single ZIP (streamed, never stored).
- **Admin panel** — Dashboard with stats, upload management, and settings.
- **Delete token** — Uploaders get a secure cookie to delete their own uploads.

## Architecture

| Layer      | Tech                                        |
| ---------- | ------------------------------------------- |
| Frontend   | React (Vite), plain CSS, Lucide React icons |
| Backend    | Node.js, Express                            |
| Database   | Turso / libSQL (SQLite-compatible, local)   |
| Storage    | Local filesystem (Docker volume)            |
| Deployment | Docker + docker-compose                     |

## Environment Variables

| Variable           | Default             | Description               |
| ------------------ | ------------------- | ------------------------- |
| `PORT`             | `3000`              | Server port               |
| `ADMIN_USERNAME`   | `admin`             | Admin panel username      |
| `ADMIN_PASSWORD`   | `changeme`          | Admin panel password      |
| `SESSION_SECRET`   | (random)            | Session encryption secret |
| `UPLOAD_DIRECTORY` | `./data/uploads`    | File storage directory    |
| `DATABASE_PATH`    | `./data/shareme.db` | SQLite database path      |

## Project Structure

```
.
├── backend/
│   ├── src/
│   │   ├── index.js          # Express server entry
│   │   ├── db.js             # Database initialization
│   │   ├── routes/
│   │   │   ├── upload.js     # Upload, metadata, password, ZIP, QR, delete
│   │   │   ├── download.js   # Single file download
│   │   │   └── admin.js      # Admin dashboard, settings
│   │   ├── middleware/
│   │   │   ├── auth.js       # Admin & delete token auth
│   │   │   └── upload.js     # Multer config
│   │   └── utils/
│   │       ├── id.js         # Share ID generation
│   │       ├── validation.js # Input validation
│   │       ├── cleanup.js    # Retention cleanup job
│   │       ├── zip.js        # Streaming ZIP creation
│   │       └── qr.js         # QR code generation
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── main.jsx          # React entry
│   │   ├── App.jsx           # Router setup
│   │   ├── api.js            # API client
│   │   ├── index.css         # All styles
│   │   ├── pages/
│   │   │   ├── UploadPage.jsx
│   │   │   ├── DownloadPage.jsx
│   │   │   ├── AdminPage.jsx
│   │   │   └── AdminLoginPage.jsx
│   │   └── components/       # (shared components)
│   └── tests/
├── e2e/
│   ├── tests/
│   │   └── full-flow.spec.js # Playwright E2E tests
│   └── playwright.config.js
├── Dockerfile
├── docker-compose.yml
└── README.md
```

## API Endpoints

### Public

| Method   | Path                       | Description                        |
| -------- | -------------------------- | ---------------------------------- |
| `POST`   | `/api/upload`              | Upload files (multipart/form-data) |
| `GET`    | `/api/upload/:id`          | Get upload metadata                |
| `POST`   | `/api/upload/:id/password` | Verify password                    |
| `GET`    | `/api/file/:fileId`        | Download single file               |
| `GET`    | `/api/upload/:id/zip`      | Download all files as ZIP          |
| `GET`    | `/api/upload/:id/qr`       | Download QR code PNG               |
| `DELETE` | `/api/upload/:id`          | Delete upload (cookie auth)        |

### Admin (session auth required)

| Method   | Path                    | Description          |
| -------- | ----------------------- | -------------------- |
| `POST`   | `/api/admin/login`      | Admin login          |
| `POST`   | `/api/admin/logout`     | Admin logout         |
| `GET`    | `/api/admin/check`      | Check auth status    |
| `GET`    | `/api/admin/stats`      | Dashboard statistics |
| `GET`    | `/api/admin/uploads`    | List uploads         |
| `GET`    | `/api/admin/upload/:id` | Upload detail        |
| `DELETE` | `/api/admin/upload/:id` | Delete upload        |
| `GET`    | `/api/admin/settings`   | Get settings         |
| `PUT`    | `/api/admin/settings`   | Update settings      |

## Frontend Routes

| Path           | Page                        |
| -------------- | --------------------------- |
| `/`            | Upload page                 |
| `/d/:id`       | Download page (ID or alias) |
| `/admin`       | Admin dashboard             |
| `/admin/login` | Admin login                 |

## Testing

### Backend Tests (Jest)

```bash
cd backend && npm test
```

### Frontend Tests (React Testing Library)

```bash
cd frontend && npm test
```

### E2E Tests (Playwright)

```bash
cd e2e && npx playwright install && npm test
```

## Development

```bash
# Terminal 1: Backend
cd backend && npm install && npm run dev

# Terminal 2: Frontend
cd frontend && npm install && npm run dev
```
