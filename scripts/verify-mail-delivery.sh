#!/usr/bin/env bash
# End-to-end mail check. Requires Resend key in .platform-mail.secret or ~/.resend-api-key.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TO="${1:-idea080912@yopmail.com}"

if ! php "$ROOT/scripts/platform-mail-status.php"; then
  if [[ -f /home/OSiris/.resend-api-key ]]; then
    echo "Applying key from /home/OSiris/.resend-api-key ..."
    "$ROOT/scripts/apply-resend-key.sh" "$TO"
  else
    echo "Add Resend key: see docs/PLATFORM_AUTH_MAIL_RESUME.md" >&2
    exit 1
  fi
fi

echo ""
echo "Sending verification test to ${TO} ..."
php "$ROOT/scripts/test-platform-mail.php" "$TO"
