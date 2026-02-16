import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

export default {
  port: process.env.PORT || 3000,
  dataPath: join(rootDir, 'data'),
  database: join(rootDir, 'data', 'bantracker.db'),
  
  // Remote server URL for banned IPs file
  remoteIpUrl: process.env.REMOTE_IP_URL || 'https://gpdev.com.ar/log/banned_ips.log',
  remoteHistoryUrl: process.env.REMOTE_HISTORY_URL || 'https://gpdev.com.ar/log/ban_history.log',
  
  syncInterval: 5 * 60 * 1000, // 5 minutes
  geoApi: {
    url: 'http://ip-api.com/json',
    rateLimit: 45, // requests per minute
    batchSize: 100, // max IPs per batch request
    batchUrl: 'http://ip-api.com/batch'
  }
};
