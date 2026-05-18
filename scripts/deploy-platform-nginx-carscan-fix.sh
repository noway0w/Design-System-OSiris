#!/usr/bin/env bash
# Deploy CarScan/Iris nginx fix: index.html only, no static index.php.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Copying nginx configs..."
cp "$ROOT/scripts/app-guillaumelassiat-nginx.conf" /etc/nginx/conf.d/app-guillaumelassiat-nginx.conf
cp "$ROOT/scripts/osiris-nginx-auth-protected-apps.inc" /etc/nginx/conf.d/osiris-nginx-auth-protected-apps.inc
cp "$ROOT/scripts/app-guillaumelassiat-port80-redirect.conf" /etc/nginx/conf.d/app.guillaumelassiat.com.conf

OSIRIS_443=/etc/nginx/conf.d/osiris-osirisws-443.conf
SNIPPET='include /home/OSiris/scripts/osiris-public-443-static-apps.inc;'
if [[ -f "$OSIRIS_443" ]] && ! grep -q 'osiris-public-443-static-apps' "$OSIRIS_443"; then
  echo "Adding static apps snippet to $OSIRIS_443"
  sed -i "/location \/ {/i\\    $SNIPPET" "$OSIRIS_443"
fi

echo "Removing carscan/iris index.php (served as plain text under ^~ locations)..."
rm -f "$ROOT/public_html/carscan/index.php" "$ROOT/public_html/iris/index.php"

nginx -t
systemctl reload nginx
echo "Done. Test: curl -sI https://app.guillaumelassiat.com/carscan/index.php | head -5"
