// Load environment variables (dito babasahin sa local .env)
require('dotenv').config();

const app = require('./app');
const { initDefaultImage } = require('./utils/initDefaultImage');

// Gamitin ang PORT mula sa Railway, o default to 5000 kung wala
const PORT = process.env.PORT || 5000;

// Binding to '0.0.0.0' is crucial for Railway/Docker deployments
const server = app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Server is successfully running on port ${PORT}`);
  
  // Initialize default image in Supabase Storage on startup
  console.log('\n🚀 [STARTUP] Initializing Supabase resources...');
  await initDefaultImage();
  console.log('✓ [STARTUP] Initialization complete\n');
});