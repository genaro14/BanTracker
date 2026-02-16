import Database from 'better-sqlite3';
import config from '../config.js';

let db = null;

export function initDatabase() {
  db = new Database(config.database);
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS banned_ips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT UNIQUE NOT NULL,
      country TEXT,
      country_code TEXT,
      city TEXT,
      isp TEXT,
      first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      jail TEXT DEFAULT 'sshd',
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS ban_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      total_count INTEGER NOT NULL,
      jail TEXT DEFAULT 'sshd'
    );

    CREATE INDEX IF NOT EXISTS idx_ip ON banned_ips(ip);
    CREATE INDEX IF NOT EXISTS idx_country ON banned_ips(country);
    CREATE INDEX IF NOT EXISTS idx_active ON banned_ips(is_active);
  `);

  console.log('Database initialized');
  return db;
}

export function getDb() {
  if (!db) {
    return initDatabase();
  }
  return db;
}

export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}
