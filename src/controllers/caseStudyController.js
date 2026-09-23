const prisma = require('../config/prisma');
const fs = require('fs');
const path = require('path');

const uploadsDir = path.resolve(__dirname, '../../uploads');

const getBackendUrl = () => {
  const url = process.env.BACKEND_URL || process.env.API_URL || 'https://api.elipsestudio.com';
  return url.replace(/\/+$/, '');
};

const buildUrl = (val) => {
  if (!val || typeof val !== 'string') return val;
  const s = val.trim();
  if (s.startsWith('data:') || s.startsWith('blob:')) return s;

  // Auto-convert any legacy /uploads/media/{id}.ext into clean /media/{id}
  const uploadMediaMatch = s.match(/(?:\/uploads\/media\/)(\d+)\.[a-zA-Z0-9]+$/);
  if (uploadMediaMatch) {
    return `${getBackendUrl()}/media/${uploadMediaMatch[1]}`;
  }

  // 1. Keep existing direct api.elipsestudio.com URLs intact (e.g. https://api.elipsestudio.com/media/32)
  if (s.startsWith('https://api.elipsestudio.com') || s.startsWith('http://api.elipsestudio.com')) {
    return s;
  }

  // 2. Fix URLs saved with elipsestudio.com (frontend domain) pointing to backend paths /uploads/ or /media/
  if (s.includes('elipsestudio.com/uploads/') || s.includes('elipsestudio.com/media/')) {
    const match = s.match(/(\/(?:uploads|media)\/.*)$/);
    if (match) return `${getBackendUrl()}${match[1]}`;
  }

  // 3. Keep external URLs (Unsplash, Cloudinary, etc.) completely intact
  if (s.startsWith('http://') || s.startsWith('https://')) {
    return s;
  }

  // 4. Relative paths (e.g. /media/32) -> prepend backend URL
  const p = s.startsWith('/') ? s : `/${s}`;
  return `${getBackendUrl()}${p}`;
};

const normalize = (val) => {
  if (!val) return val;
  if (/youtube\.com|youtu\.be/i.test(val)) return val;
  return val.replace(/^https?:\/\/[^/]+/, '');
};

const withUrls = (caseStudy) => ({
  ...caseStudy,
  largeBanner: caseStudy.largeBanner ? buildUrl(caseStudy.largeBanner) : caseStudy.largeBanner,
  smallBanner: caseStudy.smallBanner ? buildUrl(caseStudy.smallBanner) : caseStudy.smallBanner,
  heroImage: caseStudy.heroImage ? buildUrl(caseStudy.heroImage) : caseStudy.heroImage,
});

const deleteImageFiles = (record) => {
  const paths = [];
  if (record.largeBanner) paths.push(record.largeBanner.replace(/^https?:\/\/[^/]+/, ''));
  if (record.smallBanner) paths.push(record.smallBanner.replace(/^https?:\/\/[^/]+/, ''));
  if (record.heroImage && record.heroImage !== record.largeBanner) paths.push(record.heroImage.replace(/^https?:\/\/[^/]+/, ''));
  paths.forEach((filePath) => {
    const absPath = path.join(uploadsDir, filePath.replace(/^\/uploads\//, ''));
    try { fs.unlinkSync(absPath); } catch {}
  });
};

const getCaseStudies = async (req, res) => {
  try {
    const { featured } = req.query;
    const caseStudies = await prisma.caseStudy.findMany({
      where: featured === 'true' ? { featured: true } : undefined,
      orderBy: { position: 'asc' },
    });
    res.json(caseStudies.map(cs => withUrls(cs)));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getCaseStudyBySlug = async (req, res) => {
  try {
    const caseStudy = await prisma.caseStudy.findUnique({ where: { slug: req.query.slug } });
    if (!caseStudy) return res.status(404).json({ message: 'Case study not found' });
    res.json(withUrls(caseStudy));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createCaseStudy = async (req, res) => {
  try {
    const {
      title,
      metaTitle,
      metaDescription,
      slug,
      largeBanner,
      smallBanner,
      heroImage,
      heroVideo,
      content,
      client,
      service,
      category,
      duration,
      deliverables,
      overviewHeading,
      overviewText,
      challengeHeading,
      challengeText,
      results,
      processSteps,
      galleryCategories,
      videoTabs,
      ctaUrl,
      ctaText,
      videoUrl,
      featured,
    } = req.body;
    await prisma.caseStudy.updateMany({ data: { position: { increment: 1 } } });
    const caseStudy = await prisma.caseStudy.create({
      data: {
        title,
        metaTitle: metaTitle || null,
        metaDescription: metaDescription || null,
        slug,
        largeBanner: normalize(largeBanner),
        smallBanner: normalize(smallBanner),
        heroImage: normalize(heroImage),
        heroVideo: normalize(heroVideo),
        content: content || '',
        client: client || null,
        service: service || null,
        category: category || null,
        duration: duration || null,
        deliverables: deliverables || null,
        overviewHeading: overviewHeading || null,
        overviewText: overviewText || null,
        challengeHeading: challengeHeading || null,
        challengeText: challengeText || null,
        results: results || '[]',
        processSteps: processSteps || '[]',
        galleryCategories: galleryCategories || '[]',
        videoTabs: videoTabs || '[]',
        ctaUrl: ctaUrl || null,
        ctaText: ctaText || null,
        videoUrl: videoUrl || null,
        featured: featured || false,
        position: 0,
      },
    });
    res.status(201).json(caseStudy);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateCaseStudy = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      metaTitle,
      metaDescription,
      slug,
      largeBanner,
      smallBanner,
      heroImage,
      heroVideo,
      content,
      client,
      service,
      category,
      duration,
      deliverables,
      overviewHeading,
      overviewText,
      challengeHeading,
      challengeText,
      results,
      processSteps,
      galleryCategories,
      videoTabs,
      ctaUrl,
      ctaText,
      videoUrl,
      featured,
    } = req.body;
    const cleanedData = {
      ...(title !== undefined && { title }),
      ...(metaTitle !== undefined && { metaTitle: metaTitle || null }),
      ...(metaDescription !== undefined && { metaDescription: metaDescription || null }),
      ...(slug !== undefined && { slug }),
      ...(largeBanner !== undefined && { largeBanner: normalize(largeBanner) }),
      ...(smallBanner !== undefined && { smallBanner: normalize(smallBanner) }),
      ...(heroImage !== undefined && { heroImage: normalize(heroImage) }),
      ...(heroVideo !== undefined && { heroVideo: normalize(heroVideo) }),
      ...(content !== undefined && { content }),
      ...(client !== undefined && { client: client || null }),
      ...(service !== undefined && { service: service || null }),
      ...(category !== undefined && { category: category || null }),
      ...(duration !== undefined && { duration: duration || null }),
      ...(deliverables !== undefined && { deliverables: deliverables || null }),
      ...(overviewHeading !== undefined && { overviewHeading: overviewHeading || null }),
      ...(overviewText !== undefined && { overviewText: overviewText || null }),
      ...(challengeHeading !== undefined && { challengeHeading: challengeHeading || null }),
      ...(challengeText !== undefined && { challengeText: challengeText || null }),
      ...(results !== undefined && { results: results || '[]' }),
      ...(processSteps !== undefined && { processSteps: processSteps || '[]' }),
      ...(galleryCategories !== undefined && { galleryCategories: galleryCategories || '[]' }),
      ...(videoTabs !== undefined && { videoTabs: videoTabs || '[]' }),
      ...(ctaUrl !== undefined && { ctaUrl: ctaUrl || null }),
      ...(ctaText !== undefined && { ctaText: ctaText || null }),
      ...(videoUrl !== undefined && { videoUrl: videoUrl || null }),
      ...(featured !== undefined && { featured: !!featured }),
    };
    const caseStudy = await prisma.caseStudy.update({
      where: { id: parseInt(id) },
      data: cleanedData,
    });
    res.json(caseStudy);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteCaseStudy = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const caseStudy = await prisma.caseStudy.findUnique({ where: { id } });
    if (!caseStudy) return res.status(404).json({ message: 'Case study not found' });
    deleteImageFiles(caseStudy);
    await prisma.caseStudy.delete({ where: { id } });
    res.json({ message: 'Case study deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const reorderCaseStudies = async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ message: 'items array is required' });
    }
    for (const item of items) {
      await prisma.caseStudy.update({
        where: { id: parseInt(item.id) },
        data: { position: parseInt(item.position) },
      });
    }
    const allCaseStudies = await prisma.caseStudy.findMany({ orderBy: { position: 'asc' } });
    res.json(allCaseStudies);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getCaseStudies, getCaseStudyBySlug, createCaseStudy, updateCaseStudy, deleteCaseStudy, reorderCaseStudies };
