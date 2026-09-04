/**
 * scripts/migrate-urls.js
 *
 * Fast & Safe One-Time URL Migration Script
 */

require('dotenv').config();
const prisma = require('../src/config/prisma');

const BACKEND_URL = (process.env.BACKEND_URL || 'https://api.elipsestudio.com').replace(/\/$/, '');

function convertUrl(oldUrl) {
  if (!oldUrl || typeof oldUrl !== 'string') return null;

  // Already converted to direct static URL
  if (oldUrl.includes('/uploads/media/')) return null;

  // Matches /media/59, https://elipsestudio.com/media/59, media/59, etc.
  const match = oldUrl.match(/(?:^|\/|\b)media\/(\d+)(?:\.webp)?(?:\b|$)/);
  if (match && match[1]) {
    return `${BACKEND_URL}/uploads/media/${match[1]}.webp`;
  }

  return null;
}

async function run() {
  console.log('\n🚀 Starting Fast URL Migration...');
  console.log(`   Target Backend URL: ${BACKEND_URL}\n`);

  let totalUpdated = 0;




  console.log('📖 Checking Blogs...');
  const blogs = await prisma.blog.findMany({
    select: { id: true, title: true, image: true, image2: true, image3: true, image4: true },
  });

  for (const b of blogs) {
    const updates = {};
    for (const field of ['image', 'image2', 'image3', 'image4']) {
      const newUrl = convertUrl(b[field]);
      if (newUrl) updates[field] = newUrl;
    }
    if (Object.keys(updates).length > 0) {
      await prisma.blog.update({ where: { id: b.id }, data: updates });
      console.log(`  ✅ Blog #${b.id} updated`);
      totalUpdated++;
    }
  }

  // ── 2. Projects ──────────────────────────────────────────────────────────────
  console.log('📁 Checking Projects...');
  const projects = await prisma.project.findMany({
    select: { id: true, title: true, image: true, heroImage: true },
  });

  for (const p of projects) {
    const updates = {};
    for (const field of ['image', 'heroImage']) {
      const newUrl = convertUrl(p[field]);
      if (newUrl) updates[field] = newUrl;
    }
    if (Object.keys(updates).length > 0) {
      await prisma.project.update({ where: { id: p.id }, data: updates });
      console.log(`  ✅ Project #${p.id} updated`);
      totalUpdated++;
    }
  }

  // ── 3. Case Studies ──────────────────────────────────────────────────────────
  console.log('📊 Checking Case Studies...');
  const cases = await prisma.caseStudy.findMany({
    select: { id: true, title: true, largeBanner: true, smallBanner: true, heroImage: true },
  });

  for (const c of cases) {
    const updates = {};
    for (const field of ['largeBanner', 'smallBanner', 'heroImage']) {
      const newUrl = convertUrl(c[field]);
      if (newUrl) updates[field] = newUrl;
    }
    if (Object.keys(updates).length > 0) {
      await prisma.caseStudy.update({ where: { id: c.id }, data: updates });
      console.log(`  ✅ CaseStudy #${c.id} updated`);
      totalUpdated++;
    }
  }

  // ── 4. Media Table (Fast Parallel Update) ───────────────────────────────────
  console.log('🖼️  Updating Media Table Records...');
  const mediaRecords = await prisma.media.findMany({
    where: { url: null },
    select: { id: true, mimeType: true },
  });

  if (mediaRecords.length > 0) {
    console.log(`   Found ${mediaRecords.length} media records to update...`);
    // Run in batches of 10 for super-fast execution
    const batchSize = 10;
    for (let i = 0; i < mediaRecords.length; i += batchSize) {
      const chunk = mediaRecords.slice(i, i + batchSize);
      await Promise.all(
        chunk.map((m) => {
          const ext = m.mimeType === 'image/png' ? '.png'
            : m.mimeType === 'image/gif' ? '.gif'
              : m.mimeType === 'image/svg+xml' ? '.svg'
                : '.webp';
          const url = `${BACKEND_URL}/uploads/media/${m.id}${ext}`;
          return prisma.media.update({ where: { id: m.id }, data: { url } });
        })
      );
      totalUpdated += chunk.length;
      process.stdout.write(`   Progress: ${Math.min(i + batchSize, mediaRecords.length)} / ${mediaRecords.length}\r`);
    }
    console.log(`\n  ✅ All ${mediaRecords.length} Media records updated with direct URLs!`);
  } else {
    console.log('  ✅ Media table URLs already up to date.');
  }

  console.log('\n================================================================');
  console.log(` 🎉 SUCCESS: Migration finished! Total updates: ${totalUpdated}`);
  console.log('    All images now point to direct static URLs.');
  console.log('================================================================\n');

  await prisma.$disconnect();
}

run().catch((err) => {
  console.error('\n❌ Error during migration:', err);
  process.exit(1);
});
