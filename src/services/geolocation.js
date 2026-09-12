import config from '../config.js';
import { ipRepository } from '../db/repository.js';

const RATE_LIMIT_DELAY = Math.ceil(
  60000 / config.geoApi.rateLimit
);

let isProcessing = false;

// Fetch geolocation for a single IP
async function fetchGeo(ip) {
  const url = `${config.geoApi.url}/${ip}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.status === 'success') {
      return {
        success: true,
        country: data.country,
        countryCode: data.countryCode,
        city: data.city,
        isp: data.isp
      };
    }

    return {
      success: false,
      country: null
    };
  } catch (error) {
    console.error(
      `Geo lookup failed for ${ip}:`,
      error.message
    );

    return {
      success: false,
      country: null
    };
  }
}

// Fetch geolocation for a batch of IPs
async function fetchGeoBatch(ips) {
  try {
    const response = await fetch(
      config.geoApi.batchUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(ips)
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const results = await response.json();

    return results.map((data, i) => ({
      ip: ips[i],

      success: data.status === 'success',

      geoData: data.status === 'success'
        ? {
            country: data.country,
            countryCode: data.countryCode,
            city: data.city,
            isp: data.isp
          }
        : null
    }));
  } catch (error) {
    console.error(
      'Batch geo lookup failed:',
      error.message
    );

    // Don't write Error/Unknown to the database.
    // These IPs remain pending and will be retried later.
    return ips.map(ip => ({
      ip,
      success: false,
      geoData: null
    }));
  }
}

// Process IPs that don't have a successful cached location
export async function processPendingGeo() {
  if (isProcessing) {
    console.log('Geo processing already in progress');

    return {
      processed: 0,
      failed: 0
    };
  }

  isProcessing = true;

  let processed = 0;
  let failed = 0;

  try {
    const pending = ipRepository.getWithoutCountry(
      config.geoApi.batchSize
    );

    if (pending.length === 0) {
      console.log('No IPs pending geolocation');

      return {
        processed: 0,
        failed: 0
      };
    }

    console.log(
      `Processing ${pending.length} IPs for geolocation...`
    );

    const ips = pending.map(row => row.ip);

    const results = await fetchGeoBatch(ips);

    // Only write successful results.
    const successful = results.filter(
      result => result.success && result.geoData
    );

    const unsuccessful = results.length - successful.length;

    if (successful.length > 0) {
      ipRepository.updateGeoMany(successful);
    }

    processed = successful.length;
    failed = unsuccessful;

    console.log(
      `Geolocation complete: ` +
      `${processed} successful, ` +
      `${failed} failed`
    );
  } catch (error) {
    console.error(
      'Geo processing error:',
      error
    );
  } finally {
    isProcessing = false;
  }

  return {
    processed,
    failed
  };
}

// Process a single IP on demand
export async function processIp(ip) {
  const geoData = await fetchGeo(ip);

  if (!geoData.success) {
    return geoData;
  }

  ipRepository.updateGeo(ip, geoData);

  return geoData;
}

// Start background geo processor
export function startGeoProcessor(interval = 60000) {
  console.log(
    `Starting geo processor ` +
    `(interval: ${interval / 1000}s)`
  );

  // Initial processing
  setTimeout(() => {
    processPendingGeo().catch(error => {
      console.error(
        'Initial geo processing failed:',
        error
      );
    });
  }, 5000);

  // Periodic processing
  return setInterval(() => {
    processPendingGeo().catch(error => {
      console.error(
        'Periodic geo processing failed:',
        error
      );
    });
  }, interval);
}
