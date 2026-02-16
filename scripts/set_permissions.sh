#!/bin/bash
# set_permissions.sh - Set secure permissions for web directory
# Usage: sudo ./set_permissions.sh [path]
# Default path: /var/www/html

WEB_DIR="${1:-/var/www/html}"
WEB_USER="www-data"
WEB_GROUP="www-data"

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    echo "Error: This script must be run as root (use sudo)"
    exit 1
fi

# Check if directory exists
if [[ ! -d "$WEB_DIR" ]]; then
    echo "Error: Directory $WEB_DIR does not exist"
    exit 1
fi

echo "Setting secure permissions for: $WEB_DIR"
echo "Owner: $WEB_USER:$WEB_GROUP"
echo ""

# Set ownership
echo "Setting ownership..."
chown -R "$WEB_USER:$WEB_GROUP" "$WEB_DIR"

# Set directory permissions (750)
echo "Setting directory permissions (750)..."
find "$WEB_DIR" -type d -exec chmod 750 {} \;

# Set file permissions (640)
echo "Setting file permissions (640)..."
find "$WEB_DIR" -type f -exec chmod 640 {} \;

echo ""
echo "Done! Permissions set:"
echo "  Directories: 750 (rwxr-x---)"
echo "  Files:       640 (rw-r-----)"
