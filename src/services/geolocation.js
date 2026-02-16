import config from '../config.js';
import { ipRepository } from '../db/repository.js';

const RATE_LIMIT_DELAY = Math.ceil(60000 / config.geoApi.rateLimit); // ms between requests
let isProcessing = false;

// Fetch geolocation for single IP
async function fetchGeo(ip) {
  const url = `${config.geoApi.url}/${ip}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === 'success') {
      return {
        country: data.country,
        countryCode: data.countryCode,
        city: data.city,
        isp: data.isp
      };
    }
    return { country: 'Unknown' };
  } catch (error) {
    console.error(`Geo lookup failed for ${ip}:`, error.message);
    return { country: 'Error' };
  }
}

// Fetch geolocation for batch of IPs (ip-api.com supports batch)
async function fetchGeoBatch(ips) {
  try {
    const response = await fetch(config.geoApi.batchUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ips)
    });
    
    const results = await response.json();
    
    return results.map((data, i) => ({
      ip: ips[i],
      geoData: data.status === 'success' 
        ? {
            country: data.country,
            countryCode: data.countryCode,
            city: data.city,
            isp: data.isp
          }
        : { country: 'Unknown' }
    }));
  } catch (error) {
    console.error('Batch geo lookup failed:', error.message);
    return ips.map(ip => ({ ip, geoData: { country: 'Error' } }));
  }
}

// Process pending IPs (those without country)
export async function processPendingGeo() {
  if (isProcessing) {
    console.log('Geo processing already in progress');
    return { processed: 0 };
  }
  
  isProcessing = true;
  let processed = 0;
  
  try {
    const pending = ipRepository.getWithoutCountry(config.geoApi.batchSize);
    
    if (pending.length === 0) {
      console.log('No IPs pending geolocation');
      return { processed: 0 };
    }
    
    console.log(`Processing ${pending.length} IPs for geolocation...`);
    
    // Use batch API
    const ips = pending.map(row => row.ip);
    const results = await fetchGeoBatch(ips);
    
    // Update database
    ipRepository.updateGeoMany(results);
    processed = results.length;
    
    console.log(`Geolocation complete: ${processed} IPs processed`);
  } catch (error) {
    console.error('Geo processing error:', error);
  } finally {
    isProcessing = false;
  }
  
  return { processed };
}

// Process single IP (for on-demand lookup)
export async function processIp(ip) {
  const geoData = await fetchGeo(ip);
  ipRepository.updateGeo(ip, geoData);
  return geoData;
}

// Start background geo processing
export function startGeoProcessor(interval = 60000) {
  console.log(`Starting geo processor (interval: ${interval / 1000}s)`);
  
  // Initial processing after short delay
  setTimeout(() => processPendingGeo(), 5000);
  
  // Periodic processing
  return setInterval(() => processPendingGeo(), interval);
}
