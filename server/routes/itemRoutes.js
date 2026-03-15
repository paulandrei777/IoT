const express = require('express');
const router = express.Router();
const { uploadItem, getItems, approveItem, rejectItem, claimItem, requestClaim, getClaimRequests, approveClaim, rejectClaim } = require('../controllers/itemController');

// Existing routes
router.post('/upload', uploadItem);
router.get('/', getItems);

// Admin actions
router.patch('/:id/approve', approveItem);
router.patch('/:id/reject', rejectItem);

// Claim request actions
router.get('/claim-requests', getClaimRequests);
router.patch('/:id/approve-claim', approveClaim);
router.patch('/:id/reject-claim', rejectClaim);

// Student actions
router.patch('/:id/claim', claimItem);
router.patch('/:id/claim-request', requestClaim);

module.exports = router;