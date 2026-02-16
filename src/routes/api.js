import { Router } from 'express';
import { ipRepository, historyRepository } from '../db/repository.js';
import { syncIps } from '../services/fileSync.js';
import { processPendingGeo } from '../services/geolocation.js';

const router = Router();

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health check
 *     tags: [System]
 *     responses:
 *       200:
 *         description: API is running
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * @swagger
 * /api/stats:
 *   get:
 *     summary: Get summary statistics
 *     tags: [Statistics]
 *     responses:
 *       200:
 *         description: Summary statistics with country breakdown
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_banned:
 *                   type: integer
 *                   example: 1234
 *                 active:
 *                   type: integer
 *                   example: 1100
 *                 pending_geolocation:
 *                   type: integer
 *                   example: 50
 *                 by_country:
 *                   type: object
 *                   additionalProperties:
 *                     type: object
 *                     properties:
 *                       count:
 *                         type: integer
 *                       percentage:
 *                         type: number
 *                 last_updated:
 *                   type: string
 *                   format: date-time
 */
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

/**
 * @swagger
 * /api/ips:
 *   get:
 *     summary: List banned IPs
 *     tags: [IPs]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 100
 *         description: Results per page
 *       - in: query
 *         name: country
 *         schema:
 *           type: string
 *         description: Filter by country name
 *       - in: query
 *         name: active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: Paginated list of banned IPs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/BannedIP'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
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

/**
 * @swagger
 * /api/ips/{ip}:
 *   get:
 *     summary: Get specific IP details
 *     tags: [IPs]
 *     parameters:
 *       - in: path
 *         name: ip
 *         required: true
 *         schema:
 *           type: string
 *         description: IP address
 *     responses:
 *       200:
 *         description: IP details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BannedIP'
 *       404:
 *         description: IP not found
 */
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

/**
 * @swagger
 * /api/countries:
 *   get:
 *     summary: Get country breakdown
 *     tags: [Statistics]
 *     responses:
 *       200:
 *         description: List of countries with ban counts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       country:
 *                         type: string
 *                         example: China
 *                       count:
 *                         type: integer
 *                         example: 500
 *                       percentage:
 *                         type: number
 *                         example: 40.5
 */
router.get('/countries', (req, res) => {
  try {
    const countries = ipRepository.getCountryStats();
    res.json({ data: countries });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/history:
 *   get:
 *     summary: Get historical ban counts
 *     tags: [Statistics]
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Number of days to retrieve
 *       - in: query
 *         name: jail
 *         schema:
 *           type: string
 *         description: Filter by jail name
 *     responses:
 *       200:
 *         description: Historical ban data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                       total_count:
 *                         type: integer
 *                       jail:
 *                         type: string
 */
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

/**
 * @swagger
 * /api/sync:
 *   post:
 *     summary: Trigger manual sync
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Sync completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Sync complete
 *                 ips_synced:
 *                   type: integer
 *                 new_ips:
 *                   type: integer
 *                 geo_processed:
 *                   type: integer
 */
router.post('/sync', async (req, res) => {
  try {
    const syncResult = await syncIps();
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

/**
 * @swagger
 * components:
 *   schemas:
 *     BannedIP:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         ip:
 *           type: string
 *           example: 1.2.3.4
 *         country:
 *           type: string
 *           example: China
 *         country_code:
 *           type: string
 *           example: CN
 *         city:
 *           type: string
 *           example: Beijing
 *         isp:
 *           type: string
 *           example: China Telecom
 *         first_seen:
 *           type: string
 *           format: date-time
 *         last_seen:
 *           type: string
 *           format: date-time
 *         jail:
 *           type: string
 *           example: sshd
 *         is_active:
 *           type: integer
 *           example: 1
 *     Pagination:
 *       type: object
 *       properties:
 *         page:
 *           type: integer
 *         limit:
 *           type: integer
 *         total:
 *           type: integer
 *         pages:
 *           type: integer
 */

export default router;
