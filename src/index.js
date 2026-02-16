import express from 'express';
import config from './config.js';
import { initDatabase } from './db/schema.js';
import { startPeriodicSync } from './services/fileSync.js';
import { startGeoProcessor } from './services/geolocation.js';
import apiRoutes from './routes/api.js';

const app = express();

// Middleware
app.use(express.json());

// CORS (allow all for local dev)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  next();
});

// Routes
app.use('/api', apiRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'BanTracker API',
    version: '1.0.0',
    endpoints: {
      stats: 'GET /api/stats',
      ips: 'GET /api/ips',
      ip_detail: 'GET /api/ips/:ip',
      countries: 'GET /api/countries',
      history: 'GET /api/history',
      sync: 'POST /api/sync',
      health: 'GET /api/health'
    }
  });
});

// Initialize
function start() {
  // Initialize database
  initDatabase();
  
  // Start file sync (every 5 minutes)
  startPeriodicSync();
  
  // Start geolocation processor (every 1 minute)
  startGeoProcessor();
  
  // Start server
  app.listen(config.port, () => {
    console.log(`BanTracker API running on http://localhost:${config.port}`);
  });
}

start();
