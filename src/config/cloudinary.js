const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'xfzeheon',
  api_key: process.env.CLOUDINARY_API_KEY || '755897633936351',
  api_secret: process.env.CLOUDINARY_API_SECRET || '_elFm1Y-lPbFd682MmKpahXNMAc',
  secure: true,
});

/**
 * Upload a Buffer to Cloudinary
 * @param {Buffer} buffer
 * @param {string} [filename]
 * @param {string} [folder]
 * @returns {Promise<{ secure_url: string, public_id: string }>}
 */
const uploadBufferToCloudinary = (buffer, filename = '', folder = 'elipse') => {
  return new Promise((resolve, reject) => {
    // Generate clean public_id without extension
    const cleanName = filename ? filename.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_') : `img_${Date.now()}`;
    const publicId = `${cleanName}_${Date.now()}`;

    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: 'auto',
        transformation: [
          { quality: 'auto:good' },
          { fetch_format: 'auto' }
        ]
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    stream.end(buffer);
  });
};

module.exports = {
  cloudinary,
  uploadBufferToCloudinary,
};
