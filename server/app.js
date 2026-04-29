const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const itemRoutes = require('./routes/itemRoutes');
const itemLogsRoutes = require('./routes/itemLogsRoutes');
const { analyzeItem } = require('./controllers/itemController');
const { getDefaultImageUrl } = require('./config/storageConfig');

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

// Helper to inject config - now with comprehensive debugging
function injectSupabaseConfig(html, filePath) {
  const placeholder = '<!-- INJECT_CONFIG -->';
  const hasPlaceholder = html.includes(placeholder);
  
  console.log(`📄 [SERVER] Processing HTML: ${filePath}`);
  console.log(`  - Placeholder found: ${hasPlaceholder ? '✓ YES' : '❌ NO'}`);
  console.log(`  - SUPABASE_URL: ${process.env.SUPABASE_URL ? '✓ Set' : '❌ MISSING'}`);
  console.log(`  - SUPABASE_ANON_KEY: ${process.env.SUPABASE_ANON_KEY ? '✓ Set' : '❌ MISSING'}`);
  
  if (!hasPlaceholder) {
    console.warn(`⚠️  [SERVER] No injection placeholder in ${filePath}. Content will NOT have config.`);
    return html; // Return unmodified
  }

  const configScript = `<script>
    console.log('🔌 [CONFIG] Server-injected Supabase config');
    window.SUPABASE_URL = '${process.env.SUPABASE_URL || ''}';
    window.SUPABASE_ANON_KEY = '${process.env.SUPABASE_ANON_KEY || ''}';
    console.log('  - URL:', window.SUPABASE_URL ? '✓ Loaded' : '❌ Empty');
    console.log('  - Key:', window.SUPABASE_ANON_KEY ? '✓ Loaded' : '❌ Empty');
  </script>`;

  const result = html.replace(placeholder, configScript);
  const didReplace = result !== html;
  console.log(`  - Injection result: ${didReplace ? '✓ Replaced' : '❌ No match (unexpected)'}`);
  
  return result;
}

// 🔴 CRITICAL FIX: HTML injection MUST run BEFORE static middleware
// 2. Handle HTML file serving with config injection (FIRST - before express.static)
app.use((req, res, next) => {
  if (req.path === '/' || req.path.endsWith('.html')) {
    const filePath = getHtmlFilePath(req.path);
    console.log(`📥 [REQUEST] ${req.method} ${req.path} → ${filePath}`);
    
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        console.error(`❌ [FS] Failed to read ${filePath}:`, err.message);
        return next(); // Let express.static handle 404
      }
      
      console.log(`✓ [FS] Read ${Math.round(data.length / 1024)}KB from ${filePath}`);
      const injectedHtml = injectSupabaseConfig(data, filePath);
      res.type('html').send(injectedHtml);
    });
  } else {
    next();
  }
});

// 1. Serve static assets directly (CSS, JS, Images) - AFTER HTML injection
app.use(express.static(path.join(__dirname, '..')));

// API: Get storage configuration (including default image URL)
app.get('/api/config/storage', (req, res) => {
  res.json({
    defaultImageUrl: getDefaultImageUrl(),
    supabaseUrl: process.env.SUPABASE_URL,
  });
});

// Routes
app.use("/api/items", itemRoutes);
app.use("/api/item-logs", itemLogsRoutes);
app.post('/api/analyze-item', analyzeItem);

module.exports = app;