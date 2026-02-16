import config from '../config.js';
import { ipRepository, historyRepository } from '../db/repository.js';
import { processPendingGeo } from './geolocation.js';

// Fetch IPs from remote URL
async function fetchRemoteIps() {
  try {
    const response = await fetch(config.remoteIpUrl);
    if (!response.ok) {
      console.error(`Failed to fetch IPs: ${response.status}`);
      return [];
    }
    
    const content = await response.text();
    const ips = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => /^(\d{1,3}\.){3}\d{1,3}$/.test(line));
    
    return ips;
  } catch (error) {
    console.error('Error fetching remote IPs:', error.message);
    return [];
  }
}

// Sync IPs from remote URL to database (only new IPs)
export async function syncIps() {
  const ips = await fetchRemoteIps();
  
  if (ips.length === 0) {
    console.log('No IPs to sync');
    return { synced: 0, newIps: 0 };
  }
  
  // Get existing IPs from database
  const existingIps = new Set();
  const existing = ipRepository.getAll({ limit: 100000 });
  existing.data.forEach(row => existingIps.add(row.ip));
  
  // Filter out IPs already in database
  const newIps = ips.filter(ip => !existingIps.has(ip));
  
  if (newIps.length === 0) {
    console.log(`No new IPs (${ips.length} already in database)`);
    return { synced: 0, newIps: 0 };
  }
  
  // Insert only new IPs
  ipRepository.upsertMany(newIps);
  
  // Add history entry
  historyRepository.add(newIps.length);
  
  console.log(`Synced ${newIps.length} new IPs (${ips.length - newIps.length} already existed)`);
  
  // Trigger geolocation for new IPs
  setTimeout(() => processPendingGeo(), 1000);
  
  return { synced: newIps.length, newIps: newIps.length };
}

// Start periodic sync
export function startPeriodicSync(interval = config.syncInterval) {
  console.log(`Starting periodic sync every ${interval / 1000}s from ${config.remoteIpUrl}`);
  
  // Initial sync
  syncIps();
  
  // Periodic sync
  return setInterval(() => {
    syncIps();
  }, interval);
}
