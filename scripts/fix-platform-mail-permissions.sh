#!/usr/bin/env bash
# Let php-fpm (nginx) read mail env + secrets. Run on the server as root or with sudo.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API="$ROOT/public_html/api"
ENV_FILE="$API/.platform-sso.env"
SECRET_FILE="$API/.platform-mail.secret"
OUTBOX="$API/.mail-outbox"

for f in "$ENV_FILE" "$SECRET_FILE"; do
  if [[ -f "$f" ]]; then
    chmod 644 "$f"
    chgrp nginx "$f" 2>/dev/null || true
    setfacl -m u:nginx:r "$f" 2>/dev/null || true
    echo "ACL nginx read: $f"
  fi
done

mkdir -p "$OUTBOX"
chmod 770 "$OUTBOX" 2>/dev/null || true
chgrp nginx "$OUTBOX" 2>/dev/null || true
setfacl -m u:nginx:rwx "$OUTBOX" 2>/dev/null || true
echo "Outbox: $OUTBOX"

echo ""
php "$ROOT/scripts/platform-mail-status.php" || true
