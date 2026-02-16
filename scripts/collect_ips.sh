#!/bin/bash
# collect_ips.sh - Collect banned IPs from fail2ban
# Cron: 0 * * * * /path/to/collect_ips.sh
# Usage: collect_ips.sh [--all]   # --all gets all IPs, default is last 24h
# This script runs on the server with fail2ban installed

OUTPUT_DIR="/var/www/html/log"
IP_FILE="$OUTPUT_DIR/banned_ips.log"
HISTORY_FILE="$OUTPUT_DIR/ban_history.log"

mkdir -p "$OUTPUT_DIR"

if [[ "$1" == "--all" ]]; then
    # Get ALL currently banned IPs from fail2ban
    banned_ips=$(sudo fail2ban-client get sshd banip 2>/dev/null | tr ' ' '\n')
    mode="all"
else
    # Get IPs banned in last 24 hours from fail2ban.log
    # Format: 2026-02-16 10:30:00,123 fail2ban.actions: NOTICE [sshd] Ban 1.2.3.4
    YESTERDAY=$(date -d '24 hours ago' '+%Y-%m-%d %H:%M:%S')
    banned_ips=$(sudo awk -v since="$YESTERDAY" '
      $0 ~ /Ban [0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/ {
        # Extract timestamp (first two fields)
        ts = $1 " " substr($2, 1, 8)
        if (ts >= since) {
          # Extract IP (last field after "Ban")
          for (i=1; i<=NF; i++) {
            if ($i == "Ban") {
              print $(i+1)
              break
            }
          }
        }
      }
    ' /var/log/fail2ban.log 2>/dev/null)
    mode="24h"
fi

# Filter and dedupe
banned_ips=$(echo "$banned_ips" | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | sort -u)
count=$(echo "$banned_ips" | grep -c . || echo 0)

# Write IPs to file
echo "$banned_ips" > "$IP_FILE"

# Append to history log
echo "$(date '+%Y-%m-%d %H:%M:%S') - Mode: $mode - Count: $count" >> "$HISTORY_FILE"

echo "Collected $count IPs ($mode)"
