/**
 * migrate-to-cloudinary.js (READ-ONLY COPY / BACKUP SAFE)
 * ─────────────────────────────────────────────────────────────────────────────
 * Yeh script Hostinger MySQL database se saari images sirf READ karke Cloudinary
 * par COPY / UPLOAD karega.
 *
 * 🛡️ SAFETY GUARANTEE:
 * - Hostinger server se koi bhi original file ya database record DELETE nahi hoga.
 * - Hostinger MySQL ka saara original binary data 100% untouched aur safe rahega.
 * - Script sirf Cloudinary par copy create karke `cloudinary-media-map.json` banata hai.
 *
 * RUN:
 *   node scripts/migrate-to-cloudinary.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const prisma = require('../src/config/prisma');
const { uploadBufferToCloudinary } = require('../src/config/cloudinary');

const MAP_FILE = path.resolve(__dirname, '../cloudinary-media-map.json');

async function copyImagesToCloudinary() {
  console.log('================================================================');
  console.log('🛡️  SAFE CLOUDINARY COPY (HOSTINGER DATA REMAINS 100% UNTOUCHED)');
  console.log('================================================================');
  console.log('📦 Cloud Name:', process.env.CLOUDINARY_CLOUD_NAME);

  // 1. Load existing map if any (avoids re-uploading duplicate images)
  let mediaMap = {};
  if (fs.existsSync(MAP_FILE)) {
    try {
      mediaMap = JSON.parse(fs.readFileSync(MAP_FILE, 'utf-8'));
    } catch {
      mediaMap = {};
    }
  }

  // 2. Fetch all media records (READ ONLY) from MySQL database
  console.log('\n📥 Reading existing images from Hostinger database (Read-Only)...');
  const allMedia = await prisma.media.findMany({
    select: {
      id: true,
      filename: true,
      mimeType: true,
      folder: true,
      data: true,
    },
  });

  console.log(`Found ${allMedia.length} total images in Hostinger database.\n`);

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const item of allMedia) {
    const id = item.id;
    if (mediaMap[id]) {
      console.log(`  ⏭️  [Already Copied] Media #${id} -> ${mediaMap[id]}`);
      skipCount++;
      continue;
    }

    if (!item.data || item.data.length === 0) {
      console.warn(`  ⚠️  Media #${id} has no binary data, skipping`);
      continue;
    }

    try {
      const buffer = Buffer.from(item.data);
      console.log(`  ⬆️  Copying Media #${id} (${item.filename}, ${(buffer.length / 1024).toFixed(1)} KB) to Cloudinary...`);

      const result = await uploadBufferToCloudinary(
        buffer,
        `media_${id}_${item.filename}`,
        `elipse/${item.folder || 'media'}`
      );

      mediaMap[id] = result.secure_url;
      successCount++;
      console.log(`  ✅ Media #${id} copy ready -> ${result.secure_url}`);

      // Save mapping file after each successful copy
      fs.writeFileSync(MAP_FILE, JSON.stringify(mediaMap, null, 2));
    } catch (err) {
      console.error(`  ❌ Error copying Media #${id}:`, err.message);
      errorCount++;
    }
  }

  console.log('\n================================================================');
  console.log(`🎉 COPY SUMMARY:`);
  console.log(`   - New Copies Created on Cloudinary: ${successCount}`);
  console.log(`   - Already Existed / Skipped:        ${skipCount}`);
  console.log(`   - Errors:                           ${errorCount}`);
  console.log(`   - Hostinger MySQL Original Data:    100% UNTOUCHED & SAFE`);
  console.log(`   - Mapping File:                     ${MAP_FILE}`);
  console.log('================================================================\n');
}

copyImagesToCloudinary()
  .catch((e) => {
    console.error('❌ Copy process encountered an error:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
