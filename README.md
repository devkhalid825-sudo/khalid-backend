# Elipse Studio — Backend (Express API)

REST API for elipsestudio.com: blogs, projects, case studies, reviews, social media, contact form, meetings, admin auth and media uploads.
Stack: **Express + Prisma (MySQL) + Cloudinary + Nodemailer**. Live at `https://api.elipsestudio.com`.

## Quick start

```bash
npm install          # also needs a .env file (see below)
npm run build        # prisma generate
npm run dev          # nodemon, http://localhost:5003/status
npm start            # production
```

On Windows, `scripts/restart-backend.bat` stops any old backend process and starts it again.

## Folder structure

```
index.js            App entry: middleware, route mounting, static /uploads
server.js           Entry wrapper for Hostinger (just requires index.js)
prisma/schema.prisma  Database schema
src/
  config/           DB, Prisma, Cloudinary, email, auth and app settings
  routes/           URL → controller mapping (/api/blogs, /api/projects, ...)
  controllers/      Request handlers / business logic
  middleware/       Auth (JWT) and rate limiting
scripts/            One-off maintenance and migration scripts (run manually)
uploads/            Uploaded media on the server (not in git)
uploads-backup/     Local backup made by scripts/backup-images.js (not in git)
```

Adding an endpoint: create a controller in `src/controllers/`, a route file in `src/routes/`, and mount it in `index.js`.

## Environment variables (`.env`)

| Group | Variables |
| --- | --- |
| Server | `PORT`, `UPLOADS_PATH`, `ALLOWED_ORIGINS`, `BACKEND_URL`, `FRONTEND_URL`, `SITE_URL` |
| Database | `DATABASE_URL` (Prisma), `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT` |
| Auth | `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `FROM_EMAIL`, `RECIPIENT_EMAIL` |
| Media | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` |
| Security | `RECAPTCHA_SECRET_KEY` |

Never commit `.env` or `.env.production`.
