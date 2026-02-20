#!/bin/bash
# Configure nginx to execute PHP for OSiris (nginx is already on port 80)
# Usage: sudo bash setup-nginx-php.sh

set -e

echo "=== Nginx is serving port 80 - configuring PHP execution ==="

# Ensure php-fpm is running
systemctl enable --now php-fpm 2>/dev/null || true

# php-fpm user: for nginx, use nginx (not apache)
if grep -q '^user = apache' /etc/php-fpm.d/www.conf 2>/dev/null; then
    echo "Setting php-fpm user to nginx for nginx compatibility..."
    sed -i 's/^user = apache/user = nginx/' /etc/php-fpm.d/www.conf
    sed -i 's/^group = apache/group = nginx/' /etc/php-fpm.d/www.conf
    systemctl restart php-fpm
fi

# Check socket path
SOCKET=$(grep '^listen =' /etc/php-fpm.d/www.conf | head -1 | awk -F'=' '{print $2}' | tr -d ' ')
echo "PHP-FPM socket: $SOCKET"

# Ensure api directory exists and is writable by nginx
mkdir -p /home/OSiris/public_html/api
chown -R nginx:nginx /home/OSiris/public_html/api
chmod 775 /home/OSiris/public_html/api
# SELinux: allow nginx to write (RHEL/AlmaLinux)
chcon -R -t httpd_sys_rw_content_t /home/OSiris/public_html/api 2>/dev/null || \
chcon -R -t nginx_sys_rw_content_t /home/OSiris/public_html/api 2>/dev/null || true
# If /home/OSiris has restrictive perms, nginx must traverse: chmod 711 /home/OSiris, 755 public_html
chmod 711 /home/OSiris 2>/dev/null || true
chmod 755 /home/OSiris/public_html 2>/dev/null || true

# Copy nginx config
cp /home/OSiris/scripts/osiris-nginx.conf /etc/nginx/conf.d/osiris.conf

# Update socket in config if not default
if [ -n "$SOCKET" ] && [ "$SOCKET" != "/run/php-fpm/www.sock" ]; then
    sed -i "s|unix:/run/php-fpm/www.sock|unix:$SOCKET|" /etc/nginx/conf.d/osiris.conf
fi

# If nginx has a default server that might conflict, we use a catch-all
# Our config has server_name 82.165.170.76 localhost
# If default config already serves /home/OSiris or different root, we may need to merge
# For now, our server block will take precedence for 82.165.170.76

echo "=== Testing nginx config ==="
nginx -t

echo "=== Reloading nginx ==="
systemctl reload nginx

echo "=== Test PHP ==="
sleep 1
curl -s http://127.0.0.1/api/debug-users.php | head -c 300
echo ""
echo ""
echo "If you see JSON above, PHP is working. If you see <?php, check socket path."
