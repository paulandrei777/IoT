const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const itemRoutes = require('./routes/itemRoutes');
const itemLogsRoutes = require('./routes/itemLogsRoutes'); // <-- add this
const { analyzeItem } = require('./controllers/itemController');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, '..')));

// Middleware to inject Supabase config into HTML files
app.use((req, res, next) => {
  if (req.path.endsWith('.html')) {
    const filePath = path.join(__dirname, '..', req.path);
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) return next();
      const injected = data.replace(
        '<!-- INJECT_CONFIG -->',
        `<script>
          window.SUPABASE_URL = '${process.env.SUPABASE_URL}';
          window.SUPABASE_ANON_KEY = '${process.env.SUPABASE_ANON_KEY}';
        </script>`
      );
      res.send(injected);
    });
  } else {
    next();
  }
});

// Routes
app.use("/api/items", itemRoutes);
app.use("/api/item-logs", itemLogsRoutes); // <-- register logs route
app.post('/api/analyze-item', analyzeItem);

// Root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/home.html'));

  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).send('Unable to load homepage');
    }

    const injected = data.replace(
      '<!-- INJECT_CONFIG -->',
      `<script>
          window.SUPABASE_URL = '${process.env.SUPABASE_URL}';
          window.SUPABASE_ANON_KEY = '${process.env.SUPABASE_ANON_KEY}';
        </script>`
    );

    res.send(injected);
  });
});

module.exports = app;