import { Router } from 'express';
import { ipRepository, historyRepository } from '../db/repository.js';
import { syncIpList } from '../services/fileSync.js';

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
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
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
 */
router.get('/stats', (req, res) => {
  try {
    const stats = ipRepository.getStats();
    const countries = ipRepository.getCountryStats();

    const byCountry = {};

    countries.forEach(country => {
      byCountry[country.country] = {
        count: country.count,
        percentage: country.percentage
      };
    });

    res.json({
      total_banned: stats.total,
      active: stats.active,
      pending_geolocation: stats.pendingGeo,
      by_country: byCountry,
      last_updated: stats.lastUpdated
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({
      error: error.message
    });
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
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 100
 *       - in: query
 *         name: country
 *         schema:
 *           type: string
 *       - in: query
 *         name: active
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Paginated list of banned IPs
 */
router.get('/ips', (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 50, 1),
      100
    );

    const {
      country,
      active
    } = req.query;

    const result = ipRepository.getAll({
      page,
      limit,
      country,
      active: active !== undefined
        ? active === 'true'
        : undefined
    });

    res.json(result);
  } catch (error) {
    console.error('List IPs error:', error);
    res.status(500).json({
      error: error.message
    });
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
 *     responses:
 *       200:
 *         description: IP details
 *       404:
 *         description: IP not found
 */
router.get('/ips/:ip', (req, res) => {
  try {
    const ip = ipRepository.getByIp(req.params.ip);

    if (!ip) {
      return res.status(404).json({
        error: 'IP not found'
      });
    }

    res.json(ip);
  } catch (error) {
    console.error('Get IP error:', error);
    res.status(500).json({
      error: error.message
    });
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
 */
router.get('/countries', (req, res) => {
  try {
    const countries = ipRepository.getCountryStats();

    res.json({
      data: countries
    });
  } catch (error) {
    console.error('Country stats error:', error);
    res.status(500).json({
      error: error.message
    });
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
 *       - in: query
 *         name: jail
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Historical ban data
 */
router.get('/history', (req, res) => {
  try {
    const days = Math.max(
      parseInt(req.query.days, 10) || 30,
      1
    );

    const { jail } = req.query;

    const history = historyRepository.getHistory({
      days,
      jail
    });

    res.json({
      data: history
    });
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/sync:
 *   post:
 *     summary: Synchronize current Fail2Ban IP list
 *     description: |
 *       Receives the current list of banned IPs from Fail2Ban.
 *       SQLite is used as the authoritative cache. Existing IPs
 *       with valid geolocation data are reused and are not sent
 *       to the external geolocation service again.
 *     tags: [System]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: array
 *                 items:
 *                   type: string
 *                 example:
 *                   - 1.2.3.4
 *                   - 8.8.8.8
 *               - type: object
 *                 properties:
 *                   ips:
 *                     type: array
 *                     items:
 *                       type: string
 *                     example:
 *                       - 1.2.3.4
 *                       - 8.8.8.8
 *     responses:
 *       200:
 *         description: Synchronization completed
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Synchronization failed
 */
router.post('/sync', async (req, res) => {
  try {
    let ips;

    /*
     * Accept either:
     *
     * ["1.2.3.4", "8.8.8.8"]
     *
     * or:
     *
     * {
     *   "ips": ["1.2.3.4", "8.8.8.8"]
     * }
     */
    if (Array.isArray(req.body)) {
      ips = req.body;
    } else if (Array.isArray(req.body?.ips)) {
      ips = req.body.ips;
    } else {
      return res.status(400).json({
        error: 'Expected an array of IP addresses'
      });
    }

    const syncResult = await syncIpList(ips);

    res.json({
      message: 'Sync complete',
      ips_received: ips.length,
      ips_synced: syncResult.synced,
      new_ips: syncResult.newIps,
      needs_geo: syncResult.needsGeo
    });
  } catch (error) {
    console.error('API sync error:', error);

    res.status(500).json({
      error: error.message
    });
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
 *           nullable: true
 *           example: China
 *         country_code:
 *           type: string
 *           nullable: true
 *           example: CN
 *         city:
 *           type: string
 *           nullable: true
 *           example: Beijing
 *         isp:
 *           type: string
 *           nullable: true
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
 *
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
