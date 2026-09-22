const express = require('express');
const router = express.Router();
const { 
  sendContactEmail, 
  getContacts, 
  updateContactStatus, 
  deleteContact 
} = require('../controllers/contactController');
const { protect } = require('../middleware/authMiddleware');
const { contactRateLimiter } = require('../middleware/rateLimiter');

// Public route with rate limiting (max 5 requests per 15 minutes)
router.post('/contact', contactRateLimiter, sendContactEmail);

// Protected Admin routes
router.get('/', protect, getContacts);
router.put('/:id', protect, updateContactStatus);
router.delete('/:id', protect, deleteContact);

module.exports = router;

