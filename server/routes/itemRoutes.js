const express = require('express');
const router = express.Router();
const { uploadItem, getItems } = require('../controllers/itemController');
const { approveItem, rejectItem } = require('../controllers/adminController'); // for admin approval

// Item endpoints
router.post('/upload', uploadItem);
router.get('/', getItems);

// Admin approval endpoints
router.patch('/:id/approve', approveItem);
router.patch('/:id/reject', rejectItem);

module.exports = router;