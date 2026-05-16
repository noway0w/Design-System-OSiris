#!/usr/bin/env bash
# Configure real outbound mail for OSiris platform.
# Usage:
#   ./scripts/setup-platform-mail.sh gmail-app-password YOUR_16_CHAR_APP_PASSWORD
#   ./scripts/setup-platform-mail.sh resend re_YOUR_RESEND_KEY
#   ./scripts/setup-platform-mail.sh resend --file /path/to/key.txt
#   ./scripts/setup-platform-mail.sh google-oauth   # prints URL to authorize Gmail API send
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/public_html/api/.platform-sso.env"
SECRET_FILE="$ROOT/public_html/api/.platform-mail.secret"
API_DIR="$ROOT/public_html/api"

mode="${1:-}"
val="${2:-}"
orig_arg2="${2:-}"
orig_arg3="${3:-}"
orig_arg4="${4:-}"

set_env_key() {
  local key="$1"
  local value="$2"
  touch "$ENV_FILE"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    local escaped
    escaped="$(printf '%s' "$value" | sed 's/[&/\]/\\&/g')"
    sed -i "s|^${key}=.*|${key}=${escaped}|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

append_env() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    return 0
  fi
  printf '\n%s=%s\n' "$key" "$value" >> "$ENV_FILE"
}

read_secret_from_arg() {
  if [[ "$val" == "--file" ]]; then
    local pwdfile="${orig_arg3:-}"
    if [[ -z "$pwdfile" || ! -f "$pwdfile" ]]; then
      echo "Error: password file required: $0 ${mode:-MODE} --file /path/to/password.txt" >&2
      exit 1
    fi
    val="$(tr -d '\r\n' < "$pwdfile")"
  fi
  val="$(printf '%s' "$val" | tr -d '\r\n')"
}

require_non_empty_secret() {
  local label="$1"
  if [[ -z "$val" ]]; then
    echo "Error: empty ${label}. Check password/API key file or argument." >&2
    exit 1
  fi
}

secure_secret_file() {
  chmod 640 "$SECRET_FILE"
  chgrp nginx "$SECRET_FILE" 2>/dev/null || true
  setfacl -m u:nginx:r "$SECRET_FILE" 2>/dev/null || true
}

ensure_mail_env_block() {
  set_env_key 'PLATFORM_MAIL_DEV_EXPOSE_LINK' '0'
}

case "$mode" in
  gmail-app-password)
    if [[ -z "$val" ]]; then
      echo "Usage: $0 gmail-app-password YOUR_GMAIL_APP_PASSWORD"
      echo "Create one at: https://myaccount.google.com/apppasswords"
      exit 1
    fi
    read_secret_from_arg
    require_non_empty_secret "Gmail app password"
    ensure_mail_env_block
    set_env_key 'PLATFORM_MAIL_PROVIDER' 'smtp'
    set_env_key 'PLATFORM_MAIL_FROM' '"OSiris <g.lassiat@gmail.com>"'
    set_env_key 'PLATFORM_SMTP_HOST' 'smtp.gmail.com'
    set_env_key 'PLATFORM_SMTP_PORT' '587'
    set_env_key 'PLATFORM_SMTP_USER' 'g.lassiat@gmail.com'
    set_env_key 'PLATFORM_SMTP_TLS' 'starttls'
    printf 'PLATFORM_SMTP_PASS=%s\n' "$val" > "$SECRET_FILE"
    sed -i 's/\r$//' "$SECRET_FILE" 2>/dev/null || true
    secure_secret_file
  ;;
  ionos|ovh|ionos-com)
    if [[ -z "$val" ]]; then
      echo "Usage: $0 ionos 'YOUR_MAILBOX_PASSWORD'"
      echo "  FR contracts: smtp.ionos.fr (default for 'ionos')"
      echo "  Other IONOS regions: $0 ionos-com 'PASSWORD'  (smtp.ionos.com)"
      echo "  Or: $0 ionos --file /path/to/password.txt"
      exit 1
    fi
    read_secret_from_arg
    require_non_empty_secret "IONOS mailbox password"
    ensure_mail_env_block
    set_env_key 'PLATFORM_MAIL_PROVIDER' 'smtp'
    set_env_key 'PLATFORM_MAIL_FROM' '"OSiris <noreply@guillaumelassiat.com>"'
    smtp_host='smtp.ionos.fr'
    if [[ "$mode" == "ionos-com" || "$mode" == "ovh" ]]; then
      smtp_host='smtp.ionos.com'
    fi
    set_env_key 'PLATFORM_SMTP_HOST' "$smtp_host"
    set_env_key 'PLATFORM_SMTP_PORT' '587'
    set_env_key 'PLATFORM_SMTP_USER' 'noreply@guillaumelassiat.com'
    set_env_key 'PLATFORM_SMTP_TLS' 'starttls'
    printf 'PLATFORM_SMTP_PASS=%s\n' "$val" > "$SECRET_FILE"
    sed -i 's/\r$//' "$SECRET_FILE" 2>/dev/null || true
    secure_secret_file
  ;;
  resend)
    if [[ -z "$val" ]]; then
      echo "Usage: $0 resend re_YOUR_API_KEY"
      echo "  Or: $0 resend --file /path/to/key.txt"
      exit 1
    fi
    read_secret_from_arg
    require_non_empty_secret "Resend API key"
    if [[ "$val" != re_* ]]; then
      echo "Warning: Resend API keys usually start with re_" >&2
    fi
    ensure_mail_env_block
    set_env_key 'PLATFORM_MAIL_PROVIDER' 'resend'
    set_env_key 'PLATFORM_MAIL_FROM' '"OSiris <noreply@guillaumelassiat.com>"'
    printf 'PLATFORM_RESEND_API_KEY=%s\n' "$val" > "$SECRET_FILE"
    sed -i 's/\r$//' "$SECRET_FILE" 2>/dev/null || true
    secure_secret_file
  ;;
  resend-test)
    # Smoke test only: Resend onboarding sender (no custom domain required)
    if [[ -z "$val" ]]; then
      echo "Usage: $0 resend-test re_YOUR_API_KEY"
      echo "  Or: $0 resend-test --file /path/to/key.txt"
      exit 1
    fi
    read_secret_from_arg
    require_non_empty_secret "Resend API key"
    ensure_mail_env_block
    set_env_key 'PLATFORM_MAIL_PROVIDER' 'resend'
    set_env_key 'PLATFORM_MAIL_FROM' '"OSiris <onboarding@resend.dev>"'
    printf 'PLATFORM_RESEND_API_KEY=%s\n' "$val" > "$SECRET_FILE"
    sed -i 's/\r$//' "$SECRET_FILE" 2>/dev/null || true
    secure_secret_file
  ;;
  google-oauth)
    ensure_mail_env_block
    set_env_key 'PLATFORM_MAIL_PROVIDER' 'gmail'
    set_env_key 'PLATFORM_MAIL_FROM' '"OSiris <g.lassiat@gmail.com>"'
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
    echo "  $0 resend API_KEY              # production From: noreply@guillaumelassiat.com"
    echo "  $0 resend --file /path/to/key"
    echo "  $0 resend-test API_KEY         # test From: onboarding@resend.dev"
    echo "  $0 gmail-app-password PASSWORD"
    echo "  $0 ionos PASSWORD"
    echo "  $0 ionos-com PASSWORD"
    echo "  $0 google-oauth"
    exit 1
  ;;
esac

mkdir -p "$API_DIR/.mail-outbox"
chmod 770 "$API_DIR/.mail-outbox" 2>/dev/null || true
chgrp nginx "$API_DIR/.mail-outbox" 2>/dev/null || true

TEST_TO="idea080912@yopmail.com"
if [[ "$orig_arg2" == "--file" ]]; then
  if [[ -n "$orig_arg4" ]]; then
    TEST_TO="$orig_arg4"
  fi
elif [[ -n "$orig_arg3" ]]; then
  TEST_TO="$orig_arg3"
fi

echo "Mail status:"
php "$ROOT/scripts/platform-mail-status.php" || true
echo ""
echo "Testing send to ${TEST_TO}..."
php "$ROOT/scripts/test-platform-mail.php" "$TEST_TO" || true
echo "Done. Reload php-fpm if needed: sudo systemctl reload php-fpm"
