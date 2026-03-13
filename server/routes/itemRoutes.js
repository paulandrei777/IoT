const express = require('express');
const router = express.Router();
const { uploadItem, getItems, approveItem, rejectItem, claimItem } = require('../controllers/itemController');

// Existing routes
router.post('/upload', uploadItem);
router.get('/', getItems);

// Admin actions
router.patch('/:id/approve', approveItem);
router.patch('/:id/reject', rejectItem);

// Student action
router.patch('/:id/claim', claimItem);

module.exports = router;