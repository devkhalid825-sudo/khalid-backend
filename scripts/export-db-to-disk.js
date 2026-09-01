/**
 * export-db-to-disk.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Hostinger MySQL database se saari images READ karke local disk par
 * `uploads/media/{id}.webp` ke roop mein save karta hai.
 *
 * 🛡️ SAFETY:
 * - Database se koi cheez delete nahi hoti.
 * - Sirf disk cache warm-up hota hai taake pehli request se hi instant load ho.
 *
 * RUN:
 *   node scripts/export-db-to-disk.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const prisma = require('../src/config/prisma');

const DISK_CACHE_DIR = path.resolve(__dirname, '../uploads/media');
if (!fs.existsSync(DISK_CACHE_DIR)) {
  fs.mkdirSync(DISK_CACHE_DIR, { recursive: true });
}

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

async function exportImages() {
  console.log('================================================================');
  console.log('💾 EXPORTING DATABASE IMAGES TO LOCAL DISK CACHE');
  console.log('================================================================');
  console.log(`📁 Target Directory: ${DISK_CACHE_DIR}\n`);

  const allMedia = await prisma.media.findMany({
    select: {
      id: true,
      filename: true,
      mimeType: true,
      data: true,
    },
  });

  console.log(`Found ${allMedia.length} total images in database.\n`);

  let count = 0;
  for (const m of allMedia) {
    if (!m.data || m.data.length === 0) continue;
    const ext = getExtFromMime(m.mimeType);
    const diskPath = path.join(DISK_CACHE_DIR, `${m.id}${ext}`);
    fs.writeFileSync(diskPath, Buffer.from(m.data));
    count++;
    console.log(`  ✅ Cached to disk: Media #${m.id} -> ${path.basename(diskPath)} (${(m.data.length / 1024).toFixed(1)} KB)`);
  }

  console.log('\n================================================================');
  console.log(`🎉 SUCCESS: ${count} images exported to disk cache!`);
  console.log('   Ab backend par `/media/:id` requests direct disk se instant load hongi.');
  console.log('================================================================\n');
}

exportImages()
  .catch((e) => console.error('Error exporting images:', e))
  .finally(async () => await prisma.$disconnect());
