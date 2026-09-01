const multer = require('multer');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const prisma = require('../config/prisma');
const { uploadBufferToCloudinary } = require('../config/cloudinary');

// ── Smart Disk Cache Directory ───────────────────────────────────────────────
const DISK_CACHE_DIR = path.resolve(__dirname, '../../uploads/media');
if (!fs.existsSync(DISK_CACHE_DIR)) {
  try {
    fs.mkdirSync(DISK_CACHE_DIR, { recursive: true });
  } catch (e) {
    console.warn('Could not create disk cache directory:', e.message);
  }
}

const MAP_FILE = path.resolve(__dirname, '../../cloudinary-media-map.json');

// In-memory cache for fast Cloudinary URL lookups
let mediaMap = {};
const loadMap = () => {
  if (fs.existsSync(MAP_FILE)) {
    try {
      mediaMap = JSON.parse(fs.readFileSync(MAP_FILE, 'utf-8'));
    } catch {
      mediaMap = {};
    }
  }
};
loadMap();

const saveMap = () => {
  try {
    fs.writeFileSync(MAP_FILE, JSON.stringify(mediaMap, null, 2));
  } catch (e) {
    console.warn('Could not save media map file:', e.message);
  }
};

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|gif|webp|svg|avif|mp4|mov|avi|mkv|webm/;
  const ext = allowed.test(file.originalname.split('.').pop().toLowerCase());
  const mime = allowed.test(file.mimetype);
  if (ext || mime) cb(null, true);
  else cb(new Error('Only image and video files are allowed'));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 50 * 1024 * 1024 } });

// Helper to determine file extension from mime type
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

    // Auto-compress raster images (jpeg, jpg, png, webp, avif) to optimized WebP
    const isCompressibleImage = /jpeg|jpg|png|webp|avif/i.test(file.mimetype) ||
      /\.(jpe?g|png|webp|avif)$/i.test(file.originalname);

    if (isCompressibleImage) {
      try {
        dataBuffer = await sharp(file.buffer)
          .rotate() // Auto-orient based on EXIF
          .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 85, effort: 4 })
          .toBuffer();
        mimeType = 'image/webp';
        filename = filename.replace(/\.[^/.]+$/, '') + '.webp';
      } catch (sharpError) {
        console.warn('Sharp compression skipped due to error, keeping original:', sharpError.message);
      }
    }

    // 1. Permanent Safety: Save backup buffer in MySQL Database
    let mediaId = null;
    try {
      const media = await prisma.media.create({
        data: {
          filename,
          mimeType,
          folder,
          data: dataBuffer,
        },
        select: { id: true },
      });
      mediaId = media.id;
    } catch (dbErr) {
      console.warn('DB Media backup save warning:', dbErr.message);
    }

    // 2. Save directly to local Disk Cache for microsecond response (<5ms)
    if (mediaId) {
      try {
        const diskPath = path.join(DISK_CACHE_DIR, `${mediaId}${getExtFromMime(mimeType)}`);
        fs.writeFileSync(diskPath, dataBuffer);
      } catch (diskErr) {
        console.warn('Disk cache write warning:', diskErr.message);
      }
    }

    // 3. Optional: Copy to Cloudinary CDN if credentials exist
    let deliveryUrl = mediaId ? `/media/${mediaId}` : null;
    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY) {
      try {
        const cdnResult = await uploadBufferToCloudinary(
          dataBuffer,
          mediaId ? `media_${mediaId}_${filename}` : filename,
          `elipse/${folder}`
        );
        if (cdnResult?.secure_url) {
          deliveryUrl = cdnResult.secure_url;
          if (mediaId) {
            mediaMap[mediaId] = deliveryUrl;
            saveMap();
          }
        }
      } catch (cErr) {
        console.warn('Cloudinary copy skipped, using disk cache:', cErr.message);
      }
    }

    console.log('Upload saved successfully:', deliveryUrl);
    res.json({ url: deliveryUrl, mediaId });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: 'Upload failed', error: error.message });
  }
};

const getMedia = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(404).send('Not found');

    // 1. Check Cloudinary CDN map (if present)
    if (mediaMap[id]) {
      res.set('Cache-Control', 'public, max-age=31536000, immutable');
      return res.redirect(301, mediaMap[id]);
    }

    // 2. Check Local Disk Cache (Instant ~5ms response, 0 DB roundtrips)
    const possibleExts = ['.webp', '.png', '.jpg', '.jpeg', '.svg', '.gif', '.avif'];
    for (const ext of possibleExts) {
      const diskPath = path.join(DISK_CACHE_DIR, `${id}${ext}`);
      if (fs.existsSync(diskPath)) {
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
        res.set('X-Source', 'DISK-CACHE');
        return res.sendFile(diskPath);
      }
    }

    // 3. If not on disk (e.g. after fresh redeploy), fetch from MySQL Database
    const media = await prisma.media.findUnique({
      where: { id },
      select: { filename: true, mimeType: true, folder: true, data: true }
    });

    if (!media || !media.data) return res.status(404).send('Not found');

    const buffer = Buffer.from(media.data);

    // 4. Auto-restore to Disk Cache so next visit is instant from disk
    try {
      const diskPath = path.join(DISK_CACHE_DIR, `${id}${getExtFromMime(media.mimeType)}`);
      fs.writeFileSync(diskPath, buffer);
    } catch (saveErr) {
      console.warn(`Could not cache Media #${id} to disk:`, saveErr.message);
    }

    // 5. Background copy to Cloudinary if configured
    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY) {
      uploadBufferToCloudinary(buffer, `media_${id}_${media.filename}`, `elipse/${media.folder || 'media'}`)
        .then((cdnResult) => {
          if (cdnResult?.secure_url) {
            mediaMap[id] = cdnResult.secure_url;
            saveMap();
          }
        })
        .catch(() => {});
    }

    // Serve current request directly
    res.set('Content-Type', media.mimeType);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.set('X-Source', 'DB-RESTORED-TO-DISK');
    res.end(buffer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { upload, uploadImage, getMedia };
