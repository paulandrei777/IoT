const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const itemRoutes = require('./routes/itemRoutes');
const itemLogsRoutes = require('./routes/itemLogsRoutes');
const { analyzeItem } = require('./controllers/itemController');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Helper to map paths to actual HTML files
function getHtmlFilePath(reqPath) {
  const normalizedPath = reqPath === '/' ? '/client/home.html' : reqPath;
  const routeMap = {
    '/login.html': '/client/login.html',
    '/register.html': '/client/register.html',
    '/admin/dashboard.html': '/admin/dashboard.html',
    '/admin/auditLogs.html': '/admin/auditLogs.html'
  };

  const mappedPath = routeMap[normalizedPath] || normalizedPath;
  return path.join(__dirname, '..', mappedPath.replace(/^\//, ''));
}

// Helper to inject config
function injectSupabaseConfig(html) {
  return html.replace(
    '<!-- INJECT_CONFIG -->',
    `<script>
      window.SUPABASE_URL = '${process.env.SUPABASE_URL || ""}';
      window.SUPABASE_ANON_KEY = '${process.env.SUPABASE_ANON_KEY || ""}';
    </script>`
  );
}

// 1. Serve static assets directly (CSS, JS, Images)
app.use(express.static(path.join(__dirname, '..')));

// 2. Handle HTML file serving with config injection
app.use((req, res, next) => {
  if (req.path === '/' || req.path.endsWith('.html')) {
    const filePath = getHtmlFilePath(req.path);
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) return next(); // Let express handle if file not found
      res.type('html').send(injectSupabaseConfig(data));
    });
  } else {
    next();
  }
});

// Routes
app.use("/api/items", itemRoutes);
app.use("/api/item-logs", itemLogsRoutes);
app.post('/api/analyze-item', analyzeItem);

module.exports = app;