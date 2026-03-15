const express = require('express');
const router = express.Router();
const { getItemLogs, createItemLog } = require('../controllers/itemLogsController');

// GET /api/item-logs
router.get('/', getItemLogs);

// POST /api/item-logs
router.post('/', createItemLog);

module.exports = router;