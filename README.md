# BanTracker

REST API for monitoring fail2ban blocked IPs with geolocation data.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Remote Server                         │
│  ┌─────────────┐     ┌──────────────┐     ┌──────────┐  │
│  │ Cron hourly │────▶│collect_ips.sh│────▶│/var/www/ │  │
│  └─────────────┘     └──────────────┘     │html/log/ │  │
│                                           └────┬─────┘  │
└────────────────────────────────────────────────┼────────┘
                                                 │ nginx
                                                 ▼
┌─────────────────────────────────────────────────────────┐
│                    Local/Any Server                      │
│  ┌──────────────────────────────────────────────────┐   │
│  │               Node.js BanTracker API              │   │
│  │  - Fetches IPs via HTTP from nginx                │   │
│  │  - Gets country data from ip-api.com              │   │
│  │  - Stores in SQLite                               │   │
│  │  - Exposes REST API                               │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Setup

### On the Remote Server (with fail2ban)

1. Copy `scripts/collect_ips.sh` to the server
2. Make it executable: `chmod +x collect_ips.sh`
3. Add cron job: `crontab -e`
   ```bash
   0 * * * * /path/to/collect_ips.sh
   ```
4. Ensure nginx serves `/var/www/html/log/banned_ips.txt`

### On the API Server (can be anywhere)

```bash
# Install dependencies
npm install

# Set the remote URL (optional, defaults to gpdev.com.ar)
export REMOTE_IP_URL="https://yourserver.com/log/banned_ips.txt"

# Start the API
npm start
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/stats` | GET | Summary statistics with country breakdown |
| `/api/ips` | GET | List banned IPs (paginated) |
| `/api/ips/:ip` | GET | Get details for specific IP |
| `/api/countries` | GET | Country distribution |
| `/api/history` | GET | Historical ban counts |
| `/api/sync` | POST | Trigger manual sync |
| `/api/health` | GET | Health check |

### Query Parameters

**GET /api/ips**
- `page` - Page number (default: 1)
- `limit` - Results per page (default: 50, max: 100)
- `country` - Filter by country name
- `active` - Filter by active status (true/false)

**GET /api/history**
- `days` - Number of days to retrieve (default: 30)

## Example Responses

### GET /api/stats
```json
{
  "total_banned": 1234,
  "active": 1100,
  "pending_geolocation": 50,
  "by_country": {
    "China": { "count": 500, "percentage": 40.5 },
    "Russia": { "count": 200, "percentage": 16.2 }
  },
  "last_updated": "2026-02-16T20:00:00Z"
}
```

### GET /api/ips?page=1&limit=20
```json
{
  "data": [
    {
      "id": 1,
      "ip": "1.2.3.4",
      "country": "China",
      "country_code": "CN",
      "city": "Beijing",
      "isp": "China Telecom",
      "first_seen": "2026-02-10T10:00:00Z",
      "last_seen": "2026-02-16T20:00:00Z",
      "is_active": 1
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 500,
    "pages": 25
  }
}
```

## Configuration

Environment variables:
- `PORT` - API port (default: 3000)
- `REMOTE_IP_URL` - URL to fetch banned IPs (default: https://gpdev.com.ar/log/banned_ips.log)

Edit `src/config.js` for other settings:
- `syncInterval` - How often to fetch new IPs (default: 5 minutes)
- `geoApi.rateLimit` - ip-api.com rate limit (45/min for free tier)

## Docker

```bash
# Build and run with Docker Compose
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

The SQLite database is persisted in a Docker volume (`bantracker-data`).
