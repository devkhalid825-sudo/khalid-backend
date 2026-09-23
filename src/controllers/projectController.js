const prisma = require('../config/prisma');
const fs = require('fs');
const path = require('path');

const uploadsDir = path.resolve(__dirname, '../../uploads');

const deleteProjectImageFiles = (record) => {
  const paths = [];
  if (record.image) {
    paths.push(record.image.replace(/^https?:\/\/[^/]+/, ''));
  }
  try {
    const sections = JSON.parse(record.sections || '[]');
    sections.forEach((s) => {
      if (s.image) paths.push(s.image.replace(/^https?:\/\/[^/]+/, ''));
    });
  } catch {}
  paths.forEach((filePath) => {
    const absPath = path.join(uploadsDir, filePath.replace(/^\/uploads\//, ''));
    try { fs.unlinkSync(absPath); } catch {}
  });
};

const getBackendUrl = () => {
  const url = process.env.BACKEND_URL || process.env.API_URL || 'https://api.elipsestudio.com';
  return url.replace(/\/+$/, '');
};

const normalize = (val) => {
  if (!val || typeof val !== 'string') return val;
  const s = val.trim();
  if (/youtube\.com|youtu\.be/i.test(s)) return s;
  const ownOrigin = /^https?:\/\/(?:api\.elipsestudio\.com|elipsestudio\.com|localhost(?::\d+)?)(?:\/|$)/i;
  if (ownOrigin.test(s)) {
    return s.replace(ownOrigin, '/');
  }
  return s;
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

const fixSections = (sections) => {
  if (!sections) return sections;
  try {
    const arr = JSON.parse(sections);
    return JSON.stringify(arr.map(s => ({ ...s, image: s.image ? buildUrl(s.image) : s.image })));
  } catch { return sections; }
};

const getProjects = async (req, res) => {
  try {
    const allProjects = await prisma.project.findMany({ orderBy: { position: 'asc' } });
    const projectsWithUrls = allProjects.map(p => ({
      ...p,
      image: p.image ? buildUrl(p.image) : p.image,
      heroImage: p.heroImage ? buildUrl(p.heroImage) : p.heroImage,
      video: p.video ? buildUrl(p.video) : p.video,
      sections: fixSections(p.sections),
    }));
    return res.json(projectsWithUrls);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getProjectByPath = async (req, res) => {
  try {
    const path = req.query.path || req.params.path;
    const project = await prisma.project.findUnique({ where: { path } });
    if (!project) return res.status(404).json({ message: 'Project not found' });
    const projectWithUrls = {
      ...project,
      image: project.image ? buildUrl(project.image) : project.image,
      heroImage: project.heroImage ? buildUrl(project.heroImage) : project.heroImage,
      video: project.video ? buildUrl(project.video) : project.video,
      sections: fixSections(project.sections),
    };
    return res.json(projectWithUrls);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createProject = async (req, res) => {
  try {
    const { title, metaTitle, metaDescription, category, image, heroImage, heroVideo, video, path, description, sections, client, service, duration, deliverables, overviewHeading, overviewText, challengeHeading, challengeText, results, processSteps, galleryCategories, videoTabs, ctaUrl, ctaText } = req.body;
    await prisma.project.updateMany({ data: { position: { increment: 1 } } });
    const project = await prisma.project.create({
      data: {
        title,
        metaTitle: metaTitle || null,
        metaDescription: metaDescription || null,
        category,
        image: normalize(image),
        heroImage: normalize(heroImage),
        heroVideo: normalize(heroVideo),
        video: normalize(video),
        path,
        description: description || '',
        sections: sections || '[]',
        position: 0,
        client: client || null,
        service: service || null,
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
      }
    });
    res.status(201).json(project);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateProject = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const allowedFields = [
      'title', 'metaTitle', 'metaDescription', 'category', 'image',
      'heroImage', 'heroVideo', 'video', 'path', 'description', 'sections',
      'position', 'client', 'service', 'duration', 'deliverables',
      'overviewHeading', 'overviewText', 'challengeHeading', 'challengeText',
      'results', 'processSteps', 'galleryCategories', 'videoTabs',
      'ctaUrl', 'ctaText'
    ];
    const cleanedData = {};
    for (const key of allowedFields) {
      if (data[key] !== undefined) {
        cleanedData[key] = data[key];
      }
    }
    if (cleanedData.image !== undefined) cleanedData.image = normalize(cleanedData.image);
    if (cleanedData.heroImage !== undefined) cleanedData.heroImage = normalize(cleanedData.heroImage);
    if (cleanedData.heroVideo !== undefined) cleanedData.heroVideo = normalize(cleanedData.heroVideo);
    if (cleanedData.video !== undefined) cleanedData.video = normalize(cleanedData.video);

    const project = await prisma.project.update({
      where: { id: parseInt(id) },
      data: cleanedData,
    });
    res.json(project);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteProject = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) return res.status(404).json({ message: 'Project not found' });
    deleteProjectImageFiles(project);
    await prisma.project.delete({ where: { id } });
    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const reorderProjects = async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ message: 'items array is required' });
    }
    for (const item of items) {
      await prisma.project.update({
        where: { id: parseInt(item.id) },
        data: { position: parseInt(item.position) },
      });
    }
    const allProjects = await prisma.project.findMany({ orderBy: { position: 'asc' } });
    res.json(allProjects);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getProjects, getProjectByPath, createProject, updateProject, deleteProject, reorderProjects };
