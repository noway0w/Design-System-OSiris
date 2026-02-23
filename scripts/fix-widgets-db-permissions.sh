#!/bin/bash
# Fix database permissions for users-widgets.php and api/users-delete.php (readonly database error)
# Run as root: sudo bash scripts/fix-widgets-db-permissions.sh
# Database and api dir must be writable by the PHP-FPM pool user (often nginx or apache)

set -e
cd "$(dirname "$0")/.."
API_DIR="public_html/api"
DB="$API_DIR/users.db"

# Detect web server user from php-fpm pool config
WWW_USER=""
for conf in /etc/php-fpm.d/www.conf /etc/php-fpm.d/nginx.conf /etc/php*/php-fpm.d/www.conf; do
  [ -f "$conf" ] || continue
  WWW_USER=$(grep -E '^user\s*=' "$conf" 2>/dev/null | head -1 | sed 's/.*=\s*//' | tr -d ' ') || true
  [ -n "$WWW_USER" ] && break
done
[ -z "$WWW_USER" ] && WWW_USER="nginx"

echo "Using web server user: $WWW_USER"

# Ensure api dir exists
mkdir -p "$API_DIR"

# Create db if missing
if [ ! -f "$DB" ]; then
  touch "$DB"
fi

# Own api dir and db by web server user (SQLite needs parent dir writable for -journal/-wal)
chown "$WWW_USER:$WWW_USER" "$API_DIR"
chown "$WWW_USER:$WWW_USER" "$DB"
chmod 775 "$API_DIR"
chmod 664 "$DB"
chown "$WWW_USER:$WWW_USER" "$DB"-journal "$DB"-wal 2>/dev/null || true

# SELinux: allow httpd/php-fpm to write
if command -v chcon &>/dev/null && [ "$(getenforce 2>/dev/null)" = "Enforcing" ]; then
  chcon -R -t httpd_sys_rw_content_t "$API_DIR" 2>/dev/null || true
  echo "Applied SELinux httpd_sys_rw_content_t to $API_DIR"
fi

echo "Done. Widget save, user delete, and clear-all should work now."
