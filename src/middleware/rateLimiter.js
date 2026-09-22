/**
 * In-memory rate limiter for form submissions (e.g. Contact form).
 * Limits IP addresses to a max number of requests within a given time window.
 */

const createRateLimiter = ({
  windowMs = 15 * 60 * 1000, // 15 minutes
  max = 5,                    // max 5 requests per window
  message = 'Too many submissions from this device. Please wait before trying again.',
} = {}) => {
  const ipStore = new Map();

  // Periodic cleanup of expired entries every 10 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of ipStore.entries()) {
      if (now - data.resetTime > 0) {
        ipStore.delete(ip);
      }
    }
  }, 10 * 60 * 1000).unref();

  return (req, res, next) => {
    // Determine client IP address
    const forwarded = req.headers['x-forwarded-for'];
    const ip = forwarded
      ? forwarded.split(',')[0].trim()
      : req.ip || req.socket?.remoteAddress || 'unknown';

    const now = Date.now();
    let record = ipStore.get(ip);

    if (!record || now >= record.resetTime) {
      // New or expired window
      record = {
        count: 1,
        resetTime: now + windowMs,
      };
      ipStore.set(ip, record);
      return next();
    }

    if (record.count >= max) {
      const remainingSeconds = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
      res.setHeader('Retry-After', remainingSeconds);
      return res.status(429).json({
        success: false,
        error: message,
        retryAfter: remainingSeconds,
        limit: max,
      });
    }

    record.count += 1;
    next();
  };
};

// 5 submissions per 15 minutes for contact forms
const contactRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'You have reached the maximum of 5 contact submissions. Please wait before trying again.',
});

module.exports = {
  createRateLimiter,
  contactRateLimiter,
};
