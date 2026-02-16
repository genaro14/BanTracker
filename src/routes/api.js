import { Router } from 'express';
import { ipRepository, historyRepository } from '../db/repository.js';
import { syncIps } from '../services/fileSync.js';
import { processPendingGeo } from '../services/geolocation.js';

const router = Router();

// GET /api/stats - Summary statistics
router.get('/stats', (req, res) => {
  try {
    const stats = ipRepository.getStats();
    const countries = ipRepository.getCountryStats();
    
    const byCountry = {};
    countries.forEach(c => {
      byCountry[c.country] = { count: c.count, percentage: c.percentage };
    });
    
    res.json({
      total_banned: stats.total,
      active: stats.active,
      pending_geolocation: stats.pendingGeo,
      by_country: byCountry,
      last_updated: stats.lastUpdated
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/ips - List banned IPs with pagination
router.get('/ips', (req, res) => {
  try {
    const { page = 1, limit = 50, country, active } = req.query;
    
    const result = ipRepository.getAll({
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 100),
      country,
      active: active !== undefined ? active === 'true' : undefined
    });
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/ips/:ip - Get specific IP details
router.get('/ips/:ip', (req, res) => {
  try {
    const ip = ipRepository.getByIp(req.params.ip);
    
    if (!ip) {
      return res.status(404).json({ error: 'IP not found' });
    }
    
    res.json(ip);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/countries - Country breakdown
router.get('/countries', (req, res) => {
  try {
    const countries = ipRepository.getCountryStats();
    res.json({ data: countries });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/history - Historical ban counts
router.get('/history', (req, res) => {
  try {
    const { days = 30, jail } = req.query;
    const history = historyRepository.getHistory({ 
      days: parseInt(days),
      jail 
    });
    res.json({ data: history });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/sync - Trigger manual sync
router.post('/sync', async (req, res) => {
  try {
    const syncResult = syncIps();
    const geoResult = await processPendingGeo();
    
    res.json({
      message: 'Sync complete',
      ips_synced: syncResult.synced,
      new_ips: syncResult.newIps,
      geo_processed: geoResult.processed
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/health - Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
