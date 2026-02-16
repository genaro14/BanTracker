import { getDb } from './schema.js';

export const ipRepository = {
  // Get all IPs
  getAll(options = {}) {
    const db = getDb();
    const { page = 1, limit = 50, country, active } = options;
    const offset = (page - 1) * limit;
    
    let query = 'SELECT * FROM banned_ips WHERE 1=1';
    const params = [];
    
    if (country) {
      query += ' AND country = ?';
      params.push(country);
    }
    if (active !== undefined) {
      query += ' AND is_active = ?';
      params.push(active ? 1 : 0);
    }
    
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
    const total = db.prepare(countQuery).get(...params).total;
    
    query += ' ORDER BY last_seen DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const data = db.prepare(query).all(...params);
    
    return {
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    };
  },

  // Get single IP
  getByIp(ip) {
    const db = getDb();
    return db.prepare('SELECT * FROM banned_ips WHERE ip = ?').get(ip);
  },

  // Get IPs needing geolocation
  getWithoutCountry(limit = 100) {
    const db = getDb();
    return db.prepare(
      'SELECT ip FROM banned_ips WHERE country IS NULL LIMIT ?'
    ).all(limit);
  },

  // Upsert IP (insert or update last_seen)
  upsert(ip, jail = 'sshd') {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO banned_ips (ip, jail, first_seen, last_seen)
      VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(ip) DO UPDATE SET 
        last_seen = CURRENT_TIMESTAMP,
        is_active = 1
    `);
    return stmt.run(ip, jail);
  },

  // Bulk upsert IPs
  upsertMany(ips, jail = 'sshd') {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO banned_ips (ip, jail, first_seen, last_seen)
      VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(ip) DO UPDATE SET 
        last_seen = CURRENT_TIMESTAMP,
        is_active = 1
    `);
    
    const upsertAll = db.transaction((ips) => {
      for (const ip of ips) {
        stmt.run(ip, jail);
      }
    });
    
    upsertAll(ips);
    return ips.length;
  },

  // Update geolocation data
  updateGeo(ip, geoData) {
    const db = getDb();
    const stmt = db.prepare(`
      UPDATE banned_ips 
      SET country = ?, country_code = ?, city = ?, isp = ?
      WHERE ip = ?
    `);
    return stmt.run(
      geoData.country,
      geoData.countryCode,
      geoData.city,
      geoData.isp,
      ip
    );
  },

  // Bulk update geolocation
  updateGeoMany(updates) {
    const db = getDb();
    const stmt = db.prepare(`
      UPDATE banned_ips 
      SET country = ?, country_code = ?, city = ?, isp = ?
      WHERE ip = ?
    `);
    
    const updateAll = db.transaction((updates) => {
      for (const { ip, geoData } of updates) {
        stmt.run(
          geoData.country || 'Unknown',
          geoData.countryCode || null,
          geoData.city || null,
          geoData.isp || null,
          ip
        );
      }
    });
    
    updateAll(updates);
    return updates.length;
  },

  // Mark IPs as inactive (not in current ban list)
  markInactive(activeIps) {
    const db = getDb();
    if (activeIps.length === 0) return;
    
    const placeholders = activeIps.map(() => '?').join(',');
    db.prepare(`
      UPDATE banned_ips SET is_active = 0 
      WHERE ip NOT IN (${placeholders})
    `).run(...activeIps);
  },

  // Get country statistics
  getCountryStats() {
    const db = getDb();
    return db.prepare(`
      SELECT 
        country,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM banned_ips), 2) as percentage
      FROM banned_ips 
      WHERE country IS NOT NULL
      GROUP BY country 
      ORDER BY count DESC
    `).all();
  },

  // Get summary stats
  getStats() {
    const db = getDb();
    const total = db.prepare('SELECT COUNT(*) as count FROM banned_ips').get();
    const active = db.prepare('SELECT COUNT(*) as count FROM banned_ips WHERE is_active = 1').get();
    const withCountry = db.prepare('SELECT COUNT(*) as count FROM banned_ips WHERE country IS NOT NULL').get();
    const lastUpdated = db.prepare('SELECT MAX(last_seen) as last FROM banned_ips').get();
    
    return {
      total: total.count,
      active: active.count,
      withCountry: withCountry.count,
      pendingGeo: total.count - withCountry.count,
      lastUpdated: lastUpdated.last
    };
  }
};

export const historyRepository = {
  // Add history entry
  add(count, jail = 'sshd') {
    const db = getDb();
    return db.prepare(
      'INSERT INTO ban_history (total_count, jail) VALUES (?, ?)'
    ).run(count, jail);
  },

  // Get history
  getHistory(options = {}) {
    const db = getDb();
    const { days = 30, jail } = options;
    
    let query = `
      SELECT * FROM ban_history 
      WHERE timestamp > datetime('now', '-${days} days')
    `;
    const params = [];
    
    if (jail) {
      query += ' AND jail = ?';
      params.push(jail);
    }
    
    query += ' ORDER BY timestamp DESC';
    
    return db.prepare(query).all(...params);
  }
};
