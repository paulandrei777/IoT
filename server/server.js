// Load environment variables (dito babasahin sa local .env)
require('dotenv').config();

const app = require('./app');

// Gamitin ang PORT mula sa Railway, o default to 5000 kung wala
const PORT = process.env.PORT || 5000;

// Binding to '0.0.0.0' is crucial for Railway/Docker deployments
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is successfully running on port ${PORT}`);
});