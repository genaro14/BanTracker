import { getDb } from './schema.js';

const hasValidGeo = (row) => {
  return row &&
    row.country &&
    !['Unknown', 'Error'].includes(row.country);
};

export const ipRepository = {
  // Get all IPs
  getAll(options = {}) {
    const db = getDb();
    const { page = 1, limit = 50, country, active, orderBy, order } = options;
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

    const countQuery = query.replace(
      'SELECT *',
      'SELECT COUNT(*) as total'
    );

    const total = db.prepare(countQuery).get(...params).total;

    // Set default order
    let orderClause = 'last_seen DESC';
    if (orderBy && ['last_seen', 'first_seen', 'ip'].includes(orderBy)) {
      orderClause = `${orderBy} ${order || 'DESC'}`;
    }

    query += ` ORDER BY ${orderClause} LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const data = db.prepare(query).all(...params);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  },

  // Get single IP
  getByIp(ip) {
    const db = getDb();

    return db.prepare(
      'SELECT * FROM banned_ips WHERE ip = ?'
    ).get(ip);
  },

  // Get multiple IPs from cache
  getByIps(ips) {
    if (!ips.length) {
      return [];
    }

    const db = getDb();
    const results = [];

    // SQLite has a limit on bound parameters, so process in chunks.
    const chunkSize = 500;

    for (let i = 0; i < ips.length; i += chunkSize) {
      const chunk = ips.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => '?').join(',');

      const rows = db.prepare(`
        SELECT *
        FROM banned_ips
        WHERE ip IN (${placeholders})
      `).all(...chunk);

      results.push(...rows);
    }

    return results;
  },

  // Get IPs needing geolocation
  getWithoutCountry(limit = 100) {
    const db = getDb();

    return db.prepare(`
      SELECT ip
      FROM banned_ips
      WHERE country IS NULL
         OR country = ''
         OR country IN ('Unknown', 'Error')
      LIMIT ?
    `).all(limit);
  },

  // Sync the current Fail2Ban list.
  //
  // Existing IP + valid geo:
  //   -> reused, NO geolocation request
  //
  // Existing IP + missing/failed geo:
  //   -> returned in needsGeo
  //
  // New IP:
  //   -> inserted and returned in needsGeo
  //
  // IP no longer in Fail2Ban:
  //   -> marked inactive
  syncCurrentIps(ips, jail = 'sshd') {
    const db = getDb();

    const uniqueIps = [...new Set(ips)];

    const existingRows = this.getByIps(uniqueIps);
    const existingMap = new Map(
      existingRows.map(row => [row.ip, row])
    );

    const upsert = db.prepare(`
      INSERT INTO banned_ips (
        ip,
        jail,
        first_seen,
        last_seen,
        is_active
      )
      VALUES (
        ?,
        ?,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        1
      )
      ON CONFLICT(ip) DO UPDATE SET
        last_seen = CURRENT_TIMESTAMP,
        is_active = 1,
        jail = excluded.jail
    `);

    const markAllInactive = db.prepare(`
      UPDATE banned_ips
      SET is_active = 0
      WHERE jail = ?
    `);

    const transaction = db.transaction(() => {
      // First consider everything from this jail inactive.
      // Current IPs are immediately reactivated below.
      markAllInactive.run(jail);

      for (const ip of uniqueIps) {
        upsert.run(ip, jail);
      }
    });

    transaction();

    const needsGeo = [];

    for (const ip of uniqueIps) {
      const existing = existingMap.get(ip);

      // New IP
      if (!existing) {
        needsGeo.push(ip);
        continue;
      }

      // Existing IP but no successful geolocation cached
      if (!hasValidGeo(existing)) {
        needsGeo.push(ip);
      }
    }

    return {
      synced: uniqueIps.length,
      newIps: uniqueIps.filter(ip => !existingMap.has(ip)),
      needsGeo
    };
  },

  // Upsert IP
  upsert(ip, jail = 'sshd') {
    const db = getDb();

    const stmt = db.prepare(`
      INSERT INTO banned_ips (
        ip,
        jail,
        first_seen,
        last_seen
      )
      VALUES (
        ?,
        ?,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
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
      INSERT INTO banned_ips (
        ip,
        jail,
        first_seen,
        last_seen
      )
      VALUES (
        ?,
        ?,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT(ip) DO UPDATE SET
        last_seen = CURRENT_TIMESTAMP,
        is_active = 1
    `);

    const upsertAll = db.transaction((items) => {
      for (const ip of items) {
        stmt.run(ip, jail);
      }
    });

    upsertAll(ips);

    return ips.length;
  },

  // Update geolocation data
  updateGeo(ip, geoData) {
    const db = getDb();

    return db.prepare(`
      UPDATE banned_ips
      SET
        country = ?,
        country_code = ?,
        city = ?,
        isp = ?
      WHERE ip = ?
    `).run(
      geoData.country || null,
      geoData.countryCode || null,
      geoData.city || null,
      geoData.isp || null,
      ip
    );
  },

  // Bulk update geolocation
  updateGeoMany(updates) {
    const db = getDb();

    const stmt = db.prepare(`
      UPDATE banned_ips
      SET
        country = ?,
        country_code = ?,
        city = ?,
        isp = ?
      WHERE ip = ?
    `);

    const updateAll = db.transaction((items) => {
      for (const { ip, geoData } of items) {
        stmt.run(
          geoData.country || null,
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

  // Mark IPs as inactive
  markInactive(activeIps, jail = 'sshd') {
    const db = getDb();

    if (activeIps.length === 0) {
      return db.prepare(`
        UPDATE banned_ips
        SET is_active = 0
        WHERE jail = ?
      `).run(jail);
    }

    const placeholders = activeIps.map(() => '?').join(',');

    return db.prepare(`
      UPDATE banned_ips
      SET is_active = 0
      WHERE jail = ?
        AND ip NOT IN (${placeholders})
    `).run(jail, ...activeIps);
  },

  // Get country statistics
  getCountryStats() {
    const db = getDb();

    return db.prepare(`
      SELECT
        country,
        COUNT(*) as count,
        ROUND(
          COUNT(*) * 100.0 /
          (SELECT COUNT(*) FROM banned_ips),
          2
        ) as percentage
      FROM banned_ips
      WHERE country IS NOT NULL
      GROUP BY country
      ORDER BY count DESC
    `).all();
  },

  // Get summary stats
  getStats() {
    const db = getDb();

    const total = db.prepare(`
      SELECT COUNT(*) as count
      FROM banned_ips
    `).get();

    const active = db.prepare(`
      SELECT COUNT(*) as count
      FROM banned_ips
      WHERE is_active = 1
    `).get();

    const withCountry = db.prepare(`
      SELECT COUNT(*) as count
      FROM banned_ips
      WHERE country IS NOT NULL
        AND country != ''
        AND country NOT IN ('Unknown', 'Error')
    `).get();

    const lastUpdated = db.prepare(`
      SELECT MAX(last_seen) as last
      FROM banned_ips
    `).get();

    return {
      total: total.count,
      active: active.count,
      withCountry: withCountry.count,
      pendingGeo: total.count - withCountry.count,
      lastUpdated: lastUpdated.last
    };
  },

  // Get recent banned IPs
  getRecent(limit = 5) {
    const db = getDb();

    return db.prepare(`
      SELECT *
      FROM banned_ips
      ORDER BY last_seen DESC
      LIMIT ?
    `).all(limit);
  }
};

export const historyRepository = {
  add(count, jail = 'sshd') {
    const db = getDb();

    return db.prepare(`
      INSERT INTO ban_history (total_count, jail)
      VALUES (?, ?)
    `).run(count, jail);
  },

  getHistory(options = {}) {
    const db = getDb();
    const { days = 30, jail } = options;

    let query = `
      SELECT *
      FROM ban_history
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
