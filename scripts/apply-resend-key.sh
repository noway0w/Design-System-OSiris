#!/usr/bin/env bash
# Apply Resend API key from a local gitignored file (no key in shell history).
# Create: printf '%s' 're_YOUR_KEY' > /home/OSiris/.resend-api-key && chmod 600 /home/OSiris/.resend-api-key
set -euo pipefail

KEYFILE="${RESEND_KEY_FILE:-/home/OSiris/.resend-api-key}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ ! -f "$KEYFILE" ]]; then
  echo "Missing ${KEYFILE}" >&2
  echo "Create it: printf '%s' 're_YOUR_KEY' > ${KEYFILE} && chmod 600 ${KEYFILE}" >&2
  exit 1
fi

exec "$ROOT/scripts/setup-platform-mail.sh" resend --file "$KEYFILE" "${2:-idea080912@yopmail.com}"
