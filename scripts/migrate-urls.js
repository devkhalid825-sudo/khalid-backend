/**
 * scripts/migrate-urls.js
 *
 * ONE-TIME SCRIPT — Run once on the server after deploying the new upload system.
 *
 * What it does:
 *  - Reads all Blog, Project, CaseStudy records
 *  - If any image field contains the old `/media/:id` route URL,
 *    it replaces it with the new direct static URL:
 *    https://api.elipsestudio.com/uploads/media/:id.webp
 *  - Does NOT delete any data. Only updates URL strings.
 *
 * Run: node scripts/migrate-urls.js
 */

require('dotenv').config();
const prisma = require('../src/config/prisma');

const BACKEND_URL = (process.env.BACKEND_URL || 'https://api.elipsestudio.com').replace(/\/$/, '');

// Convert old /media/59 → https://api.elipsestudio.com/uploads/media/59.webp
function convertUrl(oldUrl) {
  if (!oldUrl) return null;

  // Already a direct URL — skip
  if (oldUrl.startsWith('http') && oldUrl.includes('/uploads/')) return null;

  // Old /media/:id pattern
  const match = oldUrl.match(/\/media\/(\d+)/);
  if (match) {
    return `${BACKEND_URL}/uploads/media/${match[1]}.webp`;
  }

  return null; // No change needed
}

async function run() {
  console.log('🚀 Starting URL migration...');
  console.log(`   BACKEND_URL: ${BACKEND_URL}\n`);

  let totalUpdated = 0;

  // ── 1. Blog Table ────────────────────────────────────────────────────────────
  const blogs = await prisma.blog.findMany();
  for (const b of blogs) {
    const updates = {};
    for (const field of ['image', 'image2', 'image3', 'image4']) {
      const newUrl = convertUrl(b[field]);
      if (newUrl) updates[field] = newUrl;
    }
    if (Object.keys(updates).length > 0) {
      await prisma.blog.update({ where: { id: b.id }, data: updates });
      console.log(`  ✅ Blog #${b.id} "${b.title?.slice(0, 40)}" — updated: ${Object.keys(updates).join(', ')}`);
      totalUpdated++;
    }
  }

  // ── 2. Project Table ─────────────────────────────────────────────────────────
  const projects = await prisma.project.findMany();
  for (const p of projects) {
    const updates = {};
    for (const field of ['image', 'heroImage']) {
      const newUrl = convertUrl(p[field]);
      if (newUrl) updates[field] = newUrl;
    }
    if (Object.keys(updates).length > 0) {
      await prisma.project.update({ where: { id: p.id }, data: updates });
      console.log(`  ✅ Project #${p.id} "${p.title?.slice(0, 40)}" — updated: ${Object.keys(updates).join(', ')}`);
      totalUpdated++;
    }
  }

  // ── 3. CaseStudy Table ───────────────────────────────────────────────────────
  const cases = await prisma.caseStudy.findMany();
  for (const c of cases) {
    const updates = {};
    for (const field of ['largeBanner', 'smallBanner', 'heroImage']) {
      const newUrl = convertUrl(c[field]);
      if (newUrl) updates[field] = newUrl;
    }
    if (Object.keys(updates).length > 0) {
      await prisma.caseStudy.update({ where: { id: c.id }, data: updates });
      console.log(`  ✅ CaseStudy #${c.id} "${c.title?.slice(0, 40)}" — updated: ${Object.keys(updates).join(', ')}`);
      totalUpdated++;
    }
  }

  // ── 4. Media Table — also update url field for existing records ───────────────
  const mediaRecords = await prisma.media.findMany({
    where: { url: null },
    select: { id: true, mimeType: true },
  });
  for (const m of mediaRecords) {
    const ext = m.mimeType === 'image/png' ? '.png'
              : m.mimeType === 'image/gif' ? '.gif'
              : m.mimeType === 'image/svg+xml' ? '.svg'
              : '.webp';
    const url = `${BACKEND_URL}/uploads/media/${m.id}${ext}`;
    await prisma.media.update({ where: { id: m.id }, data: { url } });
    totalUpdated++;
  }
  if (mediaRecords.length > 0) {
    console.log(`  ✅ Media table: updated url field for ${mediaRecords.length} records`);
  }

  console.log(`\n================================================================`);
  console.log(` ✅ Migration complete! ${totalUpdated} records updated.`);
  console.log(`    All existing images now point to direct static URLs.`);
  console.log(`    Images load via Express static / Nginx — no DB roundtrip!`);
  console.log(`================================================================\n`);

  await prisma.$disconnect();
}

run().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
