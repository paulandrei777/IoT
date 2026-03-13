// server/routes/itemRoutes.js
const express = require("express");
const router = express.Router();
const { uploadItem, getItems } = require("../controllers/itemController");

// POST /api/items/upload
router.post("/upload", uploadItem);

// GET /api/items
router.get("/", getItems);

module.exports = router;