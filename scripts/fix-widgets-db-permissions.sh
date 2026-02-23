#!/bin/bash
# Fix database permissions for users-widgets.php (readonly database error)
# Run as root: sudo bash scripts/fix-widgets-db-permissions.sh
# php-fpm typically runs as nobody - database and api dir must be writable by that user

set -e
cd "$(dirname "$0")/.."
API_DIR="public_html/api"
DB="$API_DIR/users.db"

# Detect web server user (php-fpm pool user, or nginx/apache)
WWW_USER="nobody"
if [ -f /etc/php-fpm.d/www.conf ]; then
  WWW_USER=$(grep -E '^user\s*=' /etc/php-fpm.d/www.conf 2>/dev/null | head -1 | sed 's/.*=\s*//' | tr -d ' ') || true
fi
[ -z "$WWW_USER" ] && WWW_USER="nobody"

echo "Using web server user: $WWW_USER"

# Ensure api dir exists
mkdir -p "$API_DIR"

# Create db if missing (users-register creates it, but ensure it exists)
if [ ! -f "$DB" ]; then
  touch "$DB"
fi

# Own api dir and db by web server user (SQLite needs dir writable for -journal/-wal files)
# Only chown the directory and db file, not PHP scripts
chown "$WWW_USER:$WWW_USER" "$API_DIR"
chown "$WWW_USER:$WWW_USER" "$DB" 2>/dev/null || true
chmod 775 "$API_DIR"
chmod 664 "$DB"
# Fix any SQLite journal files
chown "$WWW_USER:$WWW_USER" "$DB"-journal "$DB"-wal 2>/dev/null || true

# SELinux: allow httpd/php-fpm to write (RHEL/CentOS)
if command -v chcon &>/dev/null; then
  chcon -R -t httpd_sys_rw_content_t "$API_DIR" 2>/dev/null || true
  echo "Applied SELinux httpd_sys_rw_content_t to $API_DIR"
fi

echo "Done. Try saving a widget again."
