const express = require('express');
const cors = require('cors');
const itemRoutes = require('./routes/itemRoutes');
const itemLogsRoutes = require('./routes/itemLogsRoutes'); // <-- add this
const { analyzeItem } = require('./controllers/itemController');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/items", itemRoutes);
app.use("/api/item-logs", itemLogsRoutes); // <-- register logs route
app.post('/api/analyze-item', analyzeItem);

// Root
app.get('/', (req, res) => {
  res.send('DominiFinds API Running ✅');
});

module.exports = app;