#!/bin/bash
# Fix cities directory permissions so PHP-FPM can write
# PHP-FPM runs as nginx:nginx (check /etc/php-fpm.d/www.conf)
# Run: sudo bash scripts/fix-cities-permissions.sh

DIR="/home/OSiris/public_html/cities"
PHP_USER="nginx"
PHP_GROUP="nginx"
sudo chown -R $PHP_USER:$PHP_GROUP "$DIR"
sudo chmod -R 775 "$DIR"
# SELinux: httpd_sys_rw_content_t allows web server to write
if command -v chcon &>/dev/null; then
  sudo chcon -R -t httpd_sys_rw_content_t "$DIR"
  echo "Set SELinux context httpd_sys_rw_content_t on $DIR"
fi
echo "cities directory now writable by PHP-FPM ($PHP_USER)"
