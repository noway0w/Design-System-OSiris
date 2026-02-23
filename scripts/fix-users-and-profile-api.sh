#!/bin/bash
# Fix users.php and install profile picture API files
# Run: sudo bash scripts/fix-users-and-profile-api.sh
set -e
cd "$(dirname "$0")/.."
API="/home/OSiris/public_html/api"
SCRIPTS="$(dirname "$0")"

cp "$SCRIPTS/users.php.fixed" "$API/users.php"
cp "$SCRIPTS/users-profile-picture.php.new" "$API/users-profile-picture.php"
cp "$SCRIPTS/profile-picture-upload.php.new" "$API/profile-picture-upload.php"

mkdir -p "$(dirname "$API")/uploads/profile-pictures"
chown nginx:nginx "$(dirname "$API")/uploads" 2>/dev/null || true
chown nginx:nginx "$(dirname "$API")/uploads/profile-pictures" 2>/dev/null || true
chmod 775 "$(dirname "$API")/uploads/profile-pictures" 2>/dev/null || true

echo "Done. users.php fixed, profile picture APIs installed."
