const multer = require('multer');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const prisma = require('../config/prisma');

// ── Static Uploads Directory ──────────────────────────────────────────────────
// Images are saved here and served directly via Express static / Nginx.
// This folder is gitignored — it persists on the server across deploys.
const DISK_CACHE_DIR = path.resolve(__dirname, '../../uploads/media');
if (!fs.existsSync(DISK_CACHE_DIR)) {
  try {
    fs.mkdirSync(DISK_CACHE_DIR, { recursive: true });
  } catch (e) {
    console.warn('Could not create uploads/media directory:', e.message);
  }
}

// Base URL for generating direct static image URLs
// Set BACKEND_URL in .env e.g. https://api.elipsestudio.com
const BACKEND_URL = (process.env.BACKEND_URL || '').replace(/\/$/, '');

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|gif|webp|svg|avif|mp4|mov|avi|mkv|webm/;
  const ext = allowed.test(file.originalname.split('.').pop().toLowerCase());
  const mime = allowed.test(file.mimetype);
  if (ext || mime) cb(null, true);
  else cb(new Error('Only image and video files are allowed'));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 50 * 1024 * 1024 } });

// Helper to get file extension from mime type
const getExtFromMime = (mime) => {
  if (!mime) return '.webp';
  if (mime === 'image/jpeg' || mime === 'image/jpg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/gif') return '.gif';
  if (mime === 'image/svg+xml') return '.svg';
  if (mime === 'image/avif') return '.avif';
  return '.webp';
};

const uploadImage = async (req, res) => {
  try {
    const file = req.file || (req.files && req.files[0]);
    if (!file) return res.status(400).json({ message: 'No file uploaded' });

    const folder = req.query.type || 'blogs';
    let dataBuffer = file.buffer;
    let mimeType = file.mimetype;
    let filename = file.originalname;

    // Auto-compress raster images to optimized WebP
    const isCompressibleImage = /jpeg|jpg|png|webp|avif/i.test(file.mimetype) ||
      /\.(jpe?g|png|webp|avif)$/i.test(file.originalname);

    if (isCompressibleImage) {
      try {
        dataBuffer = await sharp(file.buffer)
          .rotate()
          .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 85, effort: 4 })
          .toBuffer();
        mimeType = 'image/webp';
        filename = filename.replace(/\.[^/.]+$/, '') + '.webp';
      } catch (sharpError) {
        console.warn('Sharp compression skipped:', sharpError.message);
      }
    }

    const ext = getExtFromMime(mimeType);

    // Step 1: Create DB record first to get the auto-increment ID
    let mediaRecord = null;
    try {
      mediaRecord = await prisma.media.create({
        data: {
          filename,
          mimeType,
          folder,
          data: dataBuffer, // Binary backup — kept for safety, never deleted
        },
        select: { id: true },
      });
    } catch (dbErr) {
      console.error('DB Media save failed:', dbErr.message);
      return res.status(500).json({ message: 'Upload failed: DB error', error: dbErr.message });
    }

    const mediaId = mediaRecord.id;
    const diskFilename = `${mediaId}${ext}`;
    const diskPath = path.join(DISK_CACHE_DIR, diskFilename);

    // Step 2: Save file to disk at uploads/media/{id}.webp
    try {
      fs.writeFileSync(diskPath, dataBuffer);
    } catch (diskErr) {
      console.warn('Disk write warning:', diskErr.message);
    }

    // Step 3: Build direct static URL and save it back to the DB record
    // Frontend uses this URL directly — no Node.js/DB involved on load!
    const directUrl = BACKEND_URL
      ? `${BACKEND_URL}/uploads/media/${diskFilename}`
      : `/uploads/media/${diskFilename}`;

    try {
      await prisma.media.update({
        where: { id: mediaId },
        data: { url: directUrl },
      });
    } catch (urlErr) {
      console.warn('Could not save URL to DB:', urlErr.message);
    }

    console.log(`✅ Upload saved: ${directUrl}`);
    res.json({ url: directUrl, mediaId });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: 'Upload failed', error: error.message });
  }
};

// GET /media/:id — Legacy route kept for backward compatibility with existing content
// New uploads return direct /uploads/media/ URLs, so this route is only hit for old content.
const getMedia = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(404).send('Not found');

    // 1. Check Local Disk first (~5ms, 0 DB roundtrips)
    const possibleExts = ['.webp', '.png', '.jpg', '.jpeg', '.svg', '.gif', '.avif'];
    for (const ext of possibleExts) {
      const diskPath = path.join(DISK_CACHE_DIR, `${id}${ext}`);
      if (fs.existsSync(diskPath)) {
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
        res.set('X-Source', 'DISK');
        return res.sendFile(diskPath);
      }
    }

    // 2. Fallback: fetch from MySQL DB (happens only on fresh server / missing file)
    const media = await prisma.media.findUnique({
      where: { id },
      select: { filename: true, mimeType: true, folder: true, data: true }
    });

    if (!media || !media.data) return res.status(404).send('Not found');

    const buffer = Buffer.from(media.data);

    // Auto-restore to disk so next request is instant
    try {
      const diskPath = path.join(DISK_CACHE_DIR, `${id}${getExtFromMime(media.mimeType)}`);
      fs.writeFileSync(diskPath, buffer);
    } catch (saveErr) {
      console.warn(`Could not restore Media #${id} to disk:`, saveErr.message);
    }

    res.set('Content-Type', media.mimeType);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.set('X-Source', 'DB-RESTORED');
    res.end(buffer);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { upload, uploadImage, getMedia };
