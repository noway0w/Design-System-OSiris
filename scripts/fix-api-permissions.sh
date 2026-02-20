#!/bin/bash
# Fix: nginx needs write access to api/ for users.db
# Usage: sudo bash fix-api-permissions.sh

set -e

API_DIR="/home/OSiris/public_html/api"
mkdir -p "$API_DIR"

# nginx must traverse: /home/OSiris -> public_html -> api
chmod 711 /home/OSiris 2>/dev/null || true
chmod 755 /home/OSiris/public_html 2>/dev/null || true

# api writable by nginx
chown -R nginx:nginx "$API_DIR"
chmod 775 "$API_DIR"

# SELinux (RHEL/AlmaLinux)
for ctx in httpd_sys_rw_content_t nginx_sys_rw_content_t; do
    chcon -R -t $ctx "$API_DIR" 2>/dev/null && break || true
done

echo "Done. Test: curl -s http://127.0.0.1/api/debug-users.php"
