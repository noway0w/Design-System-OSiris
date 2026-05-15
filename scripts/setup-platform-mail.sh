#!/usr/bin/env bash
# Configure real outbound mail for OSiris platform.
# Usage:
#   ./scripts/setup-platform-mail.sh gmail-app-password YOUR_16_CHAR_APP_PASSWORD
#   ./scripts/setup-platform-mail.sh resend re_YOUR_RESEND_KEY
#   ./scripts/setup-platform-mail.sh google-oauth   # prints URL to authorize Gmail API send
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/public_html/api/.platform-sso.env"
SECRET_FILE="$ROOT/public_html/api/.platform-mail.secret"
API_DIR="$ROOT/public_html/api"

mode="${1:-}"
val="${2:-}"

append_env() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    return 0
  fi
  printf '\n%s=%s\n' "$key" "$value" >> "$ENV_FILE"
}

ensure_mail_env_block() {
  append_env 'PLATFORM_MAIL_FROM' '"OSiris <g.lassiat@gmail.com>"'
  append_env 'PLATFORM_MAIL_DEV_EXPOSE_LINK' '0'
}

case "$mode" in
  gmail-app-password)
    if [[ -z "$val" ]]; then
      echo "Usage: $0 gmail-app-password YOUR_GMAIL_APP_PASSWORD"
      echo "Create one at: https://myaccount.google.com/apppasswords"
      exit 1
    fi
    ensure_mail_env_block
    append_env 'PLATFORM_MAIL_PROVIDER' 'smtp'
    append_env 'PLATFORM_SMTP_HOST' 'smtp.gmail.com'
    append_env 'PLATFORM_SMTP_PORT' '587'
    append_env 'PLATFORM_SMTP_USER' 'g.lassiat@gmail.com'
    append_env 'PLATFORM_SMTP_TLS' 'starttls'
    printf 'PLATFORM_SMTP_PASS=%s\n' "$val" > "$SECRET_FILE"
    # Trim accidental CRLF from file-based passwords
    sed -i 's/\r$//' "$SECRET_FILE" 2>/dev/null || true
    chmod 640 "$SECRET_FILE"
    chgrp nginx "$SECRET_FILE" 2>/dev/null || true
    setfacl -m u:nginx:r "$SECRET_FILE" 2>/dev/null || true
  ;;
  ionos|ovh|ionos-com)
    if [[ -z "$val" ]]; then
      echo "Usage: $0 ionos 'YOUR_MAILBOX_PASSWORD'"
      echo "  FR contracts: smtp.ionos.fr (default for 'ionos')"
      echo "  Other IONOS regions: $0 ionos-com 'PASSWORD'  (smtp.ionos.com)"
      echo "  (use single quotes if the password contains ! or other shell characters)"
      echo "  Or: $0 ionos --file /path/to/password.txt"
      exit 1
    fi
    if [[ "$val" == "--file" ]]; then
      pwdfile="${3:?password file path}"
      IFS= read -r val < "$pwdfile" || val=""
      val="${val//$'\r'/}"
    fi
    ensure_mail_env_block
    append_env 'PLATFORM_MAIL_PROVIDER' 'smtp'
    append_env 'PLATFORM_MAIL_FROM' '"OSiris <noreply@guillaumelassiat.com>"'
    smtp_host='smtp.ionos.fr'
    if [[ "$mode" == "ionos-com" || "$mode" == "ovh" ]]; then
      smtp_host='smtp.ionos.com'
    fi
    append_env 'PLATFORM_SMTP_HOST' "$smtp_host"
    append_env 'PLATFORM_SMTP_PORT' '587'
    append_env 'PLATFORM_SMTP_USER' 'noreply@guillaumelassiat.com'
    append_env 'PLATFORM_SMTP_TLS' 'starttls'
    printf 'PLATFORM_SMTP_PASS=%s\n' "$val" > "$SECRET_FILE"
    # Trim accidental CRLF from file-based passwords
    sed -i 's/\r$//' "$SECRET_FILE" 2>/dev/null || true
    chmod 640 "$SECRET_FILE"
    chgrp nginx "$SECRET_FILE" 2>/dev/null || true
    setfacl -m u:nginx:r "$SECRET_FILE" 2>/dev/null || true
  ;;
  resend)
    if [[ -z "$val" ]]; then
      echo "Usage: $0 resend re_YOUR_API_KEY"
      exit 1
    fi
    ensure_mail_env_block
    append_env 'PLATFORM_MAIL_PROVIDER' 'resend'
    printf 'PLATFORM_RESEND_API_KEY=%s\n' "$val" > "$SECRET_FILE"
    chmod 640 "$SECRET_FILE"
    chgrp nginx "$SECRET_FILE" 2>/dev/null || true
  ;;
  google-oauth)
    ensure_mail_env_block
    append_env 'PLATFORM_MAIL_PROVIDER' 'gmail'
    append_env 'PLATFORM_MAIL_FROM' '"OSiris <g.lassiat@gmail.com>"'
    echo "Open this URL once (as g.lassiat@gmail.com) to authorize sending:"
    echo "https://app.guillaumelassiat.com/api/auth-mail-google-start.php"
    echo ""
    echo "In Google Cloud Console (same project as SSO):"
    echo "  - Enable Gmail API"
    echo "  - Add redirect URI: https://app.guillaumelassiat.com/api/auth-mail-google-callback.php"
    exit 0
  ;;
  *)
    echo "Usage:"
    echo "  $0 gmail-app-password PASSWORD"
    echo "  $0 ionos-com PASSWORD   # IONOS smtp.ionos.com (non-FR)"
    echo "  $0 ovh PASSWORD         # legacy alias → smtp.ionos.com"
    echo "  $0 resend API_KEY"
    echo "  $0 google-oauth"
    exit 1
  ;;
esac

mkdir -p "$API_DIR/.mail-outbox"
chmod 770 "$API_DIR/.mail-outbox" 2>/dev/null || true
chgrp nginx "$API_DIR/.mail-outbox" 2>/dev/null || true

echo "Testing send..."
php "$ROOT/scripts/test-platform-mail.php" "${3:-g.lassiat@gmail.com}" || true
echo "Done. Reload php-fpm if needed: sudo systemctl reload php-fpm"
