#!/bin/bash
# Run on VPS to fix httpd after symlink failure
# Usage: sudo bash fix-httpd-vps.sh

set -e

echo "=== Diagnosing httpd failure ==="
journalctl -xeu httpd.service --no-pager -n 20 2>/dev/null || true
echo ""
echo "=== What is serving port 80? ==="
ss -tlnp | grep ':80 ' || netstat -tlnp 2>/dev/null | grep ':80 ' || true

echo ""
echo "=== Fix: restore /var/www/html and use copy (avoids SELinux/symlink issues) ==="
# Remove symlink (rm -rf on symlink removes link only, not target)
rm -rf /var/www/html
mkdir -p /var/www/html
# Copy project
cp -a /home/OSiris/public_html/. /var/www/html/
chown -R apache:apache /var/www/html
# api/ must be writable for users.db
chmod 775 /var/www/html/api
# SELinux contexts
chcon -R -t httpd_sys_content_t /var/www/html 2>/dev/null || true
chcon -t httpd_sys_rw_content_t /var/www/html/api 2>/dev/null || true

echo ""
echo "=== Restart httpd ==="
systemctl restart httpd
systemctl status httpd --no-pager

echo ""
echo "=== Test ==="
sleep 1
curl -s http://127.0.0.1/api/debug-users.php | head -c 200
echo ""
