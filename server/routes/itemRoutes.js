const express = require('express');
const router = express.Router();
const { uploadItem, getItems, analyzeItem, blindSearchMatch, submitLostReport, getLostReports, approveMatch, rejectMatch, approveItem, rejectItem, claimItem, requestClaim, getClaimRequests, approveClaim, rejectClaim } = require('../controllers/itemController');

// Existing routes
router.post('/upload', uploadItem);
router.get('/', getItems);
router.post('/:id/analyze', analyzeItem);
router.post('/blind-search', blindSearchMatch);
router.post('/lost-report', submitLostReport);
router.get('/lost-reports', getLostReports);
router.patch('/lost-reports/:id/approve-match', approveMatch);
router.patch('/lost-reports/:id/reject-match', rejectMatch);

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