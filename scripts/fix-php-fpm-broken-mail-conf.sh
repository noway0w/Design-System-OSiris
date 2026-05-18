#!/usr/bin/env bash
# EMERGENCY: install-php-fpm-mail-env.sh may have created zz-osiris-mail.conf mode 640
# so php-fpm cannot read it → ALL PHP (SSO, dashboard, APIs) fails.
# Run: sudo bash scripts/fix-php-fpm-broken-mail-conf.sh
set -euo pipefail

CONF="/etc/php-fpm.d/zz-osiris-mail.conf"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo bash $0" >&2
  exit 1
fi

if [[ ! -f "$CONF" ]]; then
  echo "No $CONF — checking php-fpm..."
  php-fpm -t && systemctl restart php-fpm
  echo "php-fpm OK"
  exit 0
fi

echo "Fixing permissions on $CONF (must be world-readable for php-fpm include)"
chmod 644 "$CONF"
chown root:root "$CONF"

if ! php-fpm -t; then
  echo "php-fpm still broken — removing $CONF (mail will use .platform-sso.env via ACL instead)"
  rm -f "$CONF"
  php-fpm -t
fi

systemctl restart php-fpm
systemctl is-active php-fpm
echo "Done. Test https://app.guillaumelassiat.com/login/ and dashboard."
