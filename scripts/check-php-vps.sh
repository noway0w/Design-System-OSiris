#!/bin/bash
# Run this on the VPS (82.165.170.76) via SSH to diagnose PHP setup
# Usage: bash check-php-vps.sh [/path/to/public_html]

DOCROOT="${1:-/var/www/html}"
echo "=== PHP & Web Server Check (VPS) ==="
echo "Document root: $DOCROOT"
echo ""

echo "--- PHP ---"
if command -v php &>/dev/null; then
    php -v
else
    echo "PHP NOT FOUND. Install:"
    echo "  RHEL/Rocky/AlmaLinux: sudo dnf install php php-fpm php-pdo php-sqlite3 -y"
    echo "  Debian/Ubuntu:        sudo apt install php php-fpm php-sqlite3 -y"
fi

echo ""
echo "--- Web server ---"
if systemctl is-active --quiet apache2 2>/dev/null; then
    echo "Apache is running"
    php -m 2>/dev/null | grep -q sqlite && echo "  php-sqlite3: OK" || echo "  php-sqlite3: MISSING (sudo apt install php-sqlite3)"
elif systemctl is-active --quiet nginx 2>/dev/null; then
    echo "Nginx is running"
    systemctl is-active --quiet php*-fpm 2>/dev/null && echo "  PHP-FPM: running" || echo "  PHP-FPM: NOT running (sudo systemctl start php*-fpm)"
else
    echo "No Apache/nginx detected. Which web server serves 82.165.170.76?"
fi

echo ""
echo "--- API path ---"
APIDIR="$DOCROOT/api"
if [ -d "$APIDIR" ]; then
    echo "Found: $APIDIR"
    [ -f "$APIDIR/users.php" ] && echo "  users.php: OK" || echo "  users.php: MISSING"
else
    echo "Not found: $APIDIR (set correct path as first arg)"
fi

echo ""
echo "--- After fixing: test from VPS ---"
echo "  curl -s http://127.0.0.1/api/debug-users.php | head -c 200"
echo "  (Should show JSON, not PHP source)"
echo ""
