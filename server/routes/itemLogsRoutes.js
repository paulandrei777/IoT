const express = require('express');
const router = express.Router();
const { getItemLogs } = require('../controllers/itemLogsController');

// GET /api/item-logs
router.get('/', getItemLogs);

module.exports = router;