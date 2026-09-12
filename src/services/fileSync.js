import config from '../config.js';
import { ipRepository, historyRepository } from '../db/repository.js';
import { processPendingGeo } from './geolocation.js';

// Fetch IPs from remote Fail2Ban server
async function fetchRemoteIps() {
  try {
    const response = await fetch(config.remoteIpUrl);

    if (!response.ok) {
      console.error(`Failed to fetch IPs: ${response.status}`);
      return null;
    }

    const content = await response.text();

    const ips = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => {
        const parts = line.split('.');

        return parts.length === 4 &&
          parts.every(part => {
            if (!/^\d+$/.test(part)) {
              return false;
            }

            const value = Number(part);
            return value >= 0 && value <= 255;
          });
      });

    return [...new Set(ips)];
  } catch (error) {
    console.error('Error fetching remote IPs:', error.message);
    return null;
  }
}

// Sync current Fail2Ban state into SQLite.
//
// IMPORTANT:
// The database is the geolocation cache.
//
// Existing IP + country:
//   no external geolocation request.
//
// Existing IP without country:
//   geolocation required.
//
// New IP:
//   geolocation required.
export async function syncIpList(ips, jail = 'sshd') {
  if (!Array.isArray(ips)) {
    throw new Error('IP list must be an array');
  }

  const uniqueIps = [...new Set(
    ips
      .map(ip => String(ip).trim())
      .filter(ip => {
        const parts = ip.split('.');

        return parts.length === 4 &&
          parts.every(part => {
            if (!/^\d+$/.test(part)) {
              return false;
            }

            const value = Number(part);
            return value >= 0 && value <= 255;
          });
      })
  )];

  const result = ipRepository.syncCurrentIps(uniqueIps, jail);

  // History = current number of active bans
  historyRepository.add(result.synced, jail);

  console.log(
    `Sync complete: ${result.synced} active, ` +
    `${result.newIps.length} new, ` +
    `${result.needsGeo.length} need geolocation`
  );

  if (result.needsGeo.length > 0) {
    setTimeout(() => {
      processPendingGeo().catch(error => {
        console.error(
          'Geolocation processing failed:',
          error.message
        );
      });
    }, 1000);
  }

  return {
    synced: result.synced,
    newIps: result.newIps.length,
    needsGeo: result.needsGeo.length
  };
}

export async function syncIps() {
  const ips = await fetchRemoteIps();

  // null means the remote server could not be reached.
  if (ips === null) {
    console.error(
      'Sync aborted: could not retrieve remote IP list'
    );

    return {
      synced: 0,
      newIps: 0,
      needsGeo: 0,
      failed: true
    };
  }

  return syncIpList(ips);
}
// Start periodic sync
export function startPeriodicSync(interval = config.syncInterval) {
  console.log(
    `Starting periodic sync every ${interval / 1000}s ` +
    `from ${config.remoteIpUrl}`
  );

  syncIps().catch(error => {
    console.error('Initial sync failed:', error);
  });

  return setInterval(() => {
    syncIps().catch(error => {
      console.error('Periodic sync failed:', error);
    });
  }, interval);
}
