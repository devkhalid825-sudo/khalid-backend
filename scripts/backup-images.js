/**
 * backup-images.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Yeh script live backend se SAARI images download karke
 * elipse-backend/uploads-backup/ folder mein save karta hai.
 *
 * RUN KARO:
 *   node scripts/backup-images.js
 *
 * Requirements:
 *   node 18+ (built-in fetch available)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// ── Config ────────────────────────────────────────────────────────────────────
const BACKEND_API = 'https://mediumseagreen-crocodile-699024.hostingersite.com/api';
const BACKEND_BASE = 'https://mediumseagreen-crocodile-699024.hostingersite.com';
const BACKUP_DIR = path.resolve(__dirname, '..', 'uploads-backup');

// ── Helpers ───────────────────────────────────────────────────────────────────
function mkdirp(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(destPath);
        return downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => {
      file.close();
      try { fs.unlinkSync(destPath); } catch { }
      reject(err);
    });
  });
}

function toRelativePath(url) {
  if (!url) return null;
  const match = url.match(/^https?:\/\/[^/]+(\/uploads\/.+)$/);
  return match ? match[1] : (url.startsWith('/uploads/') ? url : null);
}

async function fetchJson(endpoint) {
  const res = await fetch(`${BACKEND_API}${endpoint}`);
  if (!res.ok) throw new Error(`API ${endpoint} returned ${res.status}`);
  return res.json();
}

async function backupUrl(relPath, label) {
  if (!relPath) return;
  const url = `${BACKEND_BASE}${relPath}`;
  const destPath = path.join(BACKUP_DIR, relPath.replace('/uploads/', ''));
  mkdirp(path.dirname(destPath));

  if (fs.existsSync(destPath)) {
    console.log(`  ⏭  Already exists: ${relPath}`);
    return;
  }
  try {
    await downloadFile(url, destPath);
    console.log(`  ✅ ${label}: ${path.basename(destPath)}`);
  } catch (err) {
    console.warn(`  ⚠️  Failed (${label}): ${relPath} — ${err.message}`);
  }
}

// ── Collect all image URLs from API ───────────────────────────────────────────
async function collectUrls() {
  const urls = [];

  // Blogs
  try {
    const blogs = await fetchJson('/blogs');
    const list = Array.isArray(blogs) ? blogs : (blogs.data || []);
    for (const b of list) {
      for (const field of ['image', 'image2', 'image3', 'image4']) {
        const rel = toRelativePath(b[field]);
        if (rel) urls.push({ rel, label: `blog[${b.slug || b.id}].${field}` });
      }
      // Sections
      try {
        const sections = typeof b.sections === 'string' ? JSON.parse(b.sections) : (b.sections || []);
        sections.forEach((s, i) => {
          const rel = toRelativePath(s.image);
          if (rel) urls.push({ rel, label: `blog[${b.slug}].section[${i}]` });
        });
      } catch { }
    }
    console.log(`📰 Blogs: ${list.length} records scanned`);
  } catch (e) { console.warn('⚠️  Could not fetch blogs:', e.message); }

  // Projects
  try {
    const projects = await fetchJson('/projects');
    const list = Array.isArray(projects) ? projects : (projects.data || []);
    for (const p of list) {
      for (const field of ['image', 'heroImage', 'video']) {
        const rel = toRelativePath(p[field]);
        if (rel) urls.push({ rel, label: `project[${p.path || p.id}].${field}` });
      }
      try {
        const sections = typeof p.sections === 'string' ? JSON.parse(p.sections) : (p.sections || []);
        sections.forEach((s, i) => {
          const rel = toRelativePath(s.image);
          if (rel) urls.push({ rel, label: `project[${p.path}].section[${i}]` });
        });
      } catch { }
    }
    console.log(`🏗️  Projects: ${list.length} records scanned`);
  } catch (e) { console.warn('⚠️  Could not fetch projects:', e.message); }

  // Case Studies
  try {
    const cs = await fetchJson('/case-studies');
    const list = Array.isArray(cs) ? cs : (cs.data || []);
    for (const c of list) {
      for (const field of ['largeBanner', 'smallBanner']) {
        const rel = toRelativePath(c[field]);
        if (rel) urls.push({ rel, label: `caseStudy[${c.slug || c.id}].${field}` });
      }
    }
    console.log(`📊 Case Studies: ${list.length} records scanned`);
  } catch (e) { console.warn('⚠️  Could not fetch case-studies:', e.message); }

  return urls;
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log('\n🔒 ELIPSE STUDIO — IMAGE BACKUP SCRIPT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📁 Backup folder: ${BACKUP_DIR}\n`);

  // Ensure base backup subfolders exist
  ['blogs', 'projects', 'reviews', 'case-studies', 'static'].forEach(sub => {
    mkdirp(path.join(BACKUP_DIR, sub));
  });

  console.log('⬇️  Fetching image URLs from API...\n');
  const urls = await collectUrls();

  // Deduplicate
  const unique = [...new Map(urls.map(u => [u.rel, u])).values()];
  console.log(`\n📸 Total unique images found: ${unique.length}`);
  console.log('⬇️  Downloading...\n');

  let done = 0, failed = 0;
  for (const { rel, label } of unique) {
    try {
      await backupUrl(rel, label);
      done++;
    } catch {
      failed++;
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Downloaded: ${done}`);
  if (failed > 0) console.log(`⚠️  Failed:     ${failed}`);
  console.log(`📁 Saved to:   ${BACKUP_DIR}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
})();
