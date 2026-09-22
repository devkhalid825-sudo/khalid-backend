require('dotenv').config();
const express = require('express');
const path = require('path');
const compression = require('compression');
const cors = require('cors');
const { connectDB } = require('./src/config/db');
const { appConfig, mainSiteHost } = require('./src/config/appConfig');

// Route files
const contactRoutes = require('./src/routes/contactRoutes');
const authRoutes = require('./src/routes/authRoutes');
const meetingRoutes = require('./src/routes/meetingRoutes');
const blogRoutes = require('./src/routes/blogRoutes');
const projectRoutes = require('./src/routes/projectRoutes');
const uploadRoutes = require('./src/routes/uploadRoutes');
const seedRoutes = require('./src/routes/seedRoutes');
const reviewRoutes = require('./src/routes/reviewRoutes');
const socialMediaRoutes = require('./src/routes/socialMediaRoutes');
const caseStudyRoutes = require('./src/routes/caseStudyRoutes');

// Connect to Database
connectDB();

console.log(
  '📑 Environment Check: ADMIN_EMAIL is set to:',
  process.env.ADMIN_EMAIL || '(default)'
);

const app = express();
const PORT = process.env.PORT || 5003;

// ── Social Bot Detection Helper ──────────────────────────────────────────────
// WhatsApp, Facebook, LinkedIn, Twitter bots don't run JS.
// We detect them and return a lightweight HTML page with dynamic meta tags.
const isSocialBot = (userAgent = '') => {
  const ua = userAgent.toLowerCase();
  return (
    ua.includes('facebookexternalhit') ||
    ua.includes('twitterbot') ||
    ua.includes('linkedinbot') ||
    ua.includes('whatsapp') ||
    ua.includes('slackbot') ||
    ua.includes('telegrambot') ||
    ua.includes('discordbot') ||
    ua.includes('googlebot') ||
    ua.includes('bingbot') ||
    ua.includes('applebot') ||
    ua.includes('ia_archiver') ||
    ua.includes('embedly') ||
    ua.includes('quora link preview') ||
    ua.includes('outbrain') ||
    ua.includes('pinterest')
  );
};

// ── Multi-domain Site URL Helper ────────────────────────────────────────────
// This backend serves TWO frontends:
//   1) the main site (appConfig.mainSiteUrl, from ELIPSE_SITE_URL)
//   2) the Hostinger site (detected via appConfig.hostingerHostSuffix)
// The site URL is detected from the incoming request Host header so the
// social-bot meta tags (og:url, canonical, redirect) always point at the
// correct frontend domain instead of being hardcoded to one site.
const getSiteUrl = (req) => {
  const host = (req.get('host') || '').toLowerCase();
  if (mainSiteHost && host.includes(mainSiteHost)) return appConfig.mainSiteUrl;
  if (appConfig.hostingerHostSuffix && host.includes(appConfig.hostingerHostSuffix)) return `https://${host}`;
  if (host.startsWith('localhost') || host.startsWith('127.')) return `http://${host}`;
  return process.env.SITE_URL || process.env.FRONTEND_URL || appConfig.mainSiteUrl;
};

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(compression());

// CORS — this backend is shared by multiple frontends. Allowed origins are
// loaded from the ALLOWED_ORIGINS environment variable as a comma-separated
// list, e.g.:
//   ALLOWED_ORIGINS=https://elipsestudio.com,https://aqua-chinchilla-205103.hostingersite.com,http://localhost:3000,http://localhost:5173
//
// Rules:
//   - Requests WITHOUT an Origin header are always allowed (SSR, cURL, mobile
//     apps, server-to-server calls). Browsers send Origin only on cross-origin
//     requests, so a missing header means a non-browser client.
//   - Requests whose Origin matches an entry in ALLOWED_ORIGINS are allowed
//     (exact match).
//   - Requests from any other Origin are rejected with a CORS error.
//   - If ALLOWED_ORIGINS is not set, the backend logs a warning and falls back
//     to reflecting the request origin (previous permissive behavior) so the
//     live site never goes dark because of a missing env var.
const parseAllowedOrigins = (value = '') =>
  value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);

if (allowedOrigins.length === 0) {
  console.warn(
    '⚠️  ALLOWED_ORIGINS is not configured — CORS is wide open (origin: true). ' +
    'Add it to .env / Hostinger env vars to lock down origins.'
  );
}

const corsOptions = {
  origin(origin, callback) {
    // 1) No Origin header → non-browser client (SSR, cURL, mobile). Allow.
    if (!origin) return callback(null, true);

    // 2) ALLOWED_ORIGINS not set → fail open to the previous permissive behavior.
    if (allowedOrigins.length === 0) return callback(null, true);

    // 3) Origin is explicitly allowed.
    if (allowedOrigins.includes(origin)) return callback(null, true);

    // 4) Unknown origin → reject.
    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

// Explicitly handle preflight (OPTIONS) for all routes so browsers receive
// proper Access-Control-Allow-Origin / Allow-Credentials / Allow-Methods headers.
app.options('*', cors(corsOptions));

// Hostinger's Node-hosting wrapper + CDN reject request bodies whose
// Content-Type is application/json or text/plain — they return a 400
// "Bad Request" HTML page before the request reaches Express. Only
// urlencoded form bodies and multipart pass through reliably.
// The frontend therefore sends every JSON payload as a urlencoded
// `data` field (data=<urlencoded JSON>). It's decoded here and written
// back into req.body, so controllers keep receiving req.body as the
// original JSON object. application/json is still supported for
// non-Hostinger deployments and external API clients.
app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use((req, res, next) => {
  const isUrlEncoded = (req.headers['content-type'] || '').includes('application/x-www-form-urlencoded');
  if (isUrlEncoded && typeof req.body?.data === 'string') {
    try {
      req.body = JSON.parse(req.body.data);
    } catch {
      // Invalid JSON — leave req.body as the parsed form object.
    }
  }
  next();
});

// ── Health Check ────────────────────────────────────────────────────────────
app.get('/status', (req, res) => {
  res.status(200).json({
    success: true,
    message: '✅ Server is running',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ── Uploaded Files ──────────────────────────────────────────────────────────
// Legacy files still on local disk (kept for backward compatibility — new
// uploads are stored in the database instead, since local disk does not
// survive a redeploy).
const uploadsDir = process.env.UPLOADS_PATH || path.join(__dirname, 'uploads');
const { getMedia, getUploadsMedia } = require('./src/controllers/uploadController');
app.get('/uploads/media/:filename', getUploadsMedia);
app.use('/uploads', express.static(uploadsDir));
app.get('/media/:id', getMedia);

// ── API Routes ──────────────────────────────────────────────────────────────
app.use('/api/contact', contactRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/blogs', blogRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/seed', seedRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/social-media', socialMediaRoutes);
app.use('/api/case-studies', caseStudyRoutes);

// ── Social Bot: Static Pages Meta Tags ─────────────────────────────────────────
const { name: BRAND_NAME } = appConfig;

const staticPagesMeta = {
  about: {
    title: `About Us | ${BRAND_NAME}`,
    desc: `Learn about ${BRAND_NAME}, our mission, and how we craft premium 3D visualizations, AR/VR experiences, and interactive web configurators.`,
  },
  services: {
    title: `Our Services | ${BRAND_NAME}`,
    desc: `Explore our range of interactive 3D web configurators, custom AR/VR development, architectural visualization, 3D animations, and custom website/app development.`,
  },
  capabilities: {
    title: `Our Capabilities | ${BRAND_NAME}`,
    desc: `Discover the cutting-edge tech stack, tools, and custom real-time 3D pipelines we leverage to build next-gen digital experiences.`,
  },
  portfolio: {
    title: `Portfolio | ${BRAND_NAME}`,
    desc: `Browse our showcase of premium interactive 3D apps, AR/VR solutions, animations, and high-fidelity visualizations built for global brands.`,
  },
  'case-studies': {
    title: `Case Studies | ${BRAND_NAME}`,
    desc: `Read detailed case studies showing how we help brands increase engagement and conversion rates through custom 3D web applications and AR/VR.`,
  },
  contact: {
    title: `Contact Us | ${BRAND_NAME}`,
    desc: `Get in touch with ${BRAND_NAME}. Let's discuss your next 3D, AR/VR, or web configurator project. Book a meeting or request a quote today.`,
  },
  blog: {
    title: `Blog & Insights | ${BRAND_NAME}`,
    desc: `Read the latest insights, trends, and guides on 3D configurators, AR marketing, VR training, and interactive web development.`,
  }
};

app.get('/:page(about|services|capabilities|portfolio|case-studies|contact|blog)', (req, res, next) => {
  const ua = req.headers['user-agent'] || '';
  if (!isSocialBot(ua)) return next();

  const page = req.params.page;
  const meta = staticPagesMeta[page];
  if (!meta) return next();

  const siteUrl = getSiteUrl(req);
  const pageUrl = `${siteUrl}/${page}`;
  const image = `${siteUrl}${appConfig.ogImagePath}`;

  const esc = (str = '') => String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${esc(meta.title)}</title>
  <meta name="description" content="${esc(meta.desc)}" />

  <!-- Open Graph -->
  <meta property="og:type"        content="website" />
  <meta property="og:title"       content="${esc(meta.title)}" />
  <meta property="og:description" content="${esc(meta.desc)}" />
  <meta property="og:image"       content="${esc(image)}" />
  <meta property="og:url"         content="${esc(pageUrl)}" />
  <meta property="og:site_name"   content="${esc(BRAND_NAME)}" />

  <!-- Twitter / X Card -->
  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:title"       content="${esc(meta.title)}" />
  <meta name="twitter:description" content="${esc(meta.desc)}" />
  <meta name="twitter:image"       content="${esc(image)}" />

  <!-- Canonical -->
  <link rel="canonical" href="${esc(pageUrl)}" />

  <!-- Redirect real users to the SPA -->
  <meta http-equiv="refresh" content="0;url=${esc(pageUrl)}" />
</head>
<body>
  <p>Redirecting to <a href="${esc(pageUrl)}">${esc(meta.title)}</a>…</p>
</body>
</html>`);
});

// ── Social Bot: Dynamic Blog Meta Tags ──────────────────────────────────────
// When WhatsApp / Facebook / LinkedIn bots crawl a blog URL they get a
// server-rendered HTML page with correct og: and twitter: meta tags.
// Regular browsers are NOT affected — they still get a 404 from the API
// (the SPA handles routing on the frontend).
const prisma = require('./src/config/prisma');

app.get('/blog/:slug', async (req, res, next) => {
  const ua = req.headers['user-agent'] || '';
  if (!isSocialBot(ua)) return next(); // normal user → skip

  try {
    const blog = await prisma.blog.findUnique({ where: { slug: req.params.slug } });

    const siteUrl = getSiteUrl(req);
    const baseUrl = (process.env.VITE_BACKEND_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
    const buildUrl = (val) => {
      if (!val) return `${siteUrl}${appConfig.ogImagePath}`;
      if (val.startsWith('http')) {
        // Replace any staging CDN domain with production site URL
        if (val.includes('mediumseagreen-crocodile-699024.hostingersite.com')) {
          return val.replace('https://mediumseagreen-crocodile-699024.hostingersite.com', siteUrl);
        }
        return val;
      }
      return `${siteUrl}${val.startsWith('/') ? val : '/' + val}`;
    };

    if (!blog) {
      return res.status(404).send(`<!DOCTYPE html><html><head><title>Not Found | ${BRAND_NAME}</title></head><body></body></html>`);
    }

    const seoTitle = blog.metaTitle || blog.title;
    const title = `${seoTitle} | ${BRAND_NAME}`;
    const desc = blog.metaDescription || blog.excerpt || `Read ${blog.title} on ${BRAND_NAME} — immersive 3D, AR/VR and web configurator agency.`;
    const image = buildUrl(blog.image);
    const pageUrl = `${siteUrl}/blog/${blog.slug}`;

    // Escape helper to prevent XSS in meta content
    const esc = (str = '') => String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}" />

  <!-- Open Graph -->
  <meta property="og:type"        content="article" />
  <meta property="og:title"       content="${esc(title)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:image"       content="${esc(image)}" />
  <meta property="og:url"         content="${esc(pageUrl)}" />
  <meta property="og:site_name"   content="${esc(BRAND_NAME)}" />

  <!-- Twitter / X Card -->
  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:title"       content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(desc)}" />
  <meta name="twitter:image"       content="${esc(image)}" />

  <!-- Canonical -->
  <link rel="canonical" href="${esc(pageUrl)}" />

  <!-- Redirect real users to the SPA -->
  <meta http-equiv="refresh" content="0;url=${esc(pageUrl)}" />
</head>
<body>
  <p>Redirecting to <a href="${esc(pageUrl)}">${esc(title)}</a>…</p>
</body>
</html>`);
  } catch (err) {
    console.error('Bot meta route error:', err);
    return next();
  }
});

// ── Social Bot: Dynamic Project Meta Tags ────────────────────────────────────
app.get('/project/:path(*)', async (req, res, next) => {
  const ua = req.headers['user-agent'] || '';
  if (!isSocialBot(ua)) return next();

  try {
    const fullPath = '/project/' + req.params.path;
    const project = await prisma.project.findUnique({ where: { path: fullPath } });

    const siteUrl = getSiteUrl(req);
    const baseUrl = (process.env.VITE_BACKEND_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
    const buildUrl = (val) => {
      if (!val) return `${siteUrl}${appConfig.ogImagePath}`;
      if (val.startsWith('http')) {
        // Replace any staging CDN domain with production site URL
        if (val.includes('mediumseagreen-crocodile-699024.hostingersite.com')) {
          return val.replace('https://mediumseagreen-crocodile-699024.hostingersite.com', siteUrl);
        }
        return val;
      }
      return `${siteUrl}${val.startsWith('/') ? val : '/' + val}`;
    };

    if (!project) {
      return res.status(404).send(`<!DOCTYPE html><html><head><title>Not Found | ${BRAND_NAME}</title></head><body></body></html>`);
    }

    const seoTitle = project.metaTitle || project.title;
    const title = `${seoTitle} | ${BRAND_NAME}`;
    const rawDesc = project.description ? project.description.replace(/<[^>]*>/g, '') : `Explore ${project.title} at ${BRAND_NAME}`;
    const desc = project.metaDescription || rawDesc.slice(0, 160);
    const image = buildUrl(project.image);
    const pageUrl = `${siteUrl}${project.path}`;

    const esc = (str = '') => String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}" />

  <!-- Open Graph -->
  <meta property="og:type"        content="website" />
  <meta property="og:title"       content="${esc(title)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:image"       content="${esc(image)}" />
  <meta property="og:url"         content="${esc(pageUrl)}" />
  <meta property="og:site_name"   content="${esc(BRAND_NAME)}" />

  <!-- Twitter / X Card -->
  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:title"       content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(desc)}" />
  <meta name="twitter:image"       content="${esc(image)}" />

  <!-- Canonical -->
  <link rel="canonical" href="${esc(pageUrl)}" />

  <!-- Redirect real users to the SPA -->
  <meta http-equiv="refresh" content="0;url=${esc(pageUrl)}" />
</head>
<body>
  <p>Redirecting to <a href="${esc(pageUrl)}">${esc(title)}</a>…</p>
</body>
</html>`);
  } catch (err) {
    console.error('Project bot meta route error:', err);
    return next();
  }
});

// ── 404 for everything else ─────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ── Start Server ────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ API Server listening on http://0.0.0.0:${PORT}`);
  console.log(`✅ Health Check: http://127.0.0.1:${PORT}/status`);
});