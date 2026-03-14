#!/bin/bash
# Install cfd-sidecar as systemd service. Run: sudo ./install-service.sh
# 1. Copy unit to /etc/systemd/system/
# 2. systemctl daemon-reload
# 3. systemctl enable --now cfd-sidecar
# 4. Optionally add nginx to docker group for PHP Start fallback

set -e

if [ "$EUID" -ne 0 ]; then
  echo "Run with sudo: sudo $0"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
UNIT_SRC="$SCRIPT_DIR/cfd-sidecar.service"
UNIT_DEST="/etc/systemd/system/cfd-sidecar.service"

# Detect project owner (owner of cfd-sidecar directory)
PROJECT_USER="$(stat -c '%U' "$SCRIPT_DIR" 2>/dev/null || echo "OSiris")"

echo "=== Installing CFD sidecar systemd service ==="
echo "Project directory: $SCRIPT_DIR"
echo "Service user: $PROJECT_USER"

# Update User in unit file if different from default
sed "s/^User=.*/User=$PROJECT_USER/" "$UNIT_SRC" | \
sed "s|WorkingDirectory=.*|WorkingDirectory=$SCRIPT_DIR|" > "$UNIT_DEST"

echo "Copied unit to $UNIT_DEST"
systemctl daemon-reload

# Use /var/lib/cfd-sidecar/cases (avoids SELinux blocking writes to /home)
CASES_DIR="/var/lib/cfd-sidecar/cases"
mkdir -p "$CASES_DIR"
chown -R "$PROJECT_USER:$PROJECT_USER" "$CASES_DIR"
chmod 755 "$CASES_DIR"
echo "Created cases directory: $CASES_DIR (owned by $PROJECT_USER)"

# Stop any existing sidecar on 8090 (manual start or old PHP spawn) so systemd service gets the port
systemctl stop cfd-sidecar 2>/dev/null || true
if command -v lsof &>/dev/null; then
  PIDS=$(lsof -t -i:8090 2>/dev/null || true)
  if [ -n "$PIDS" ]; then
    echo "Stopping existing process on port 8090 (PID: $PIDS)..."
    kill $PIDS 2>/dev/null || kill -9 $PIDS 2>/dev/null || true
    sleep 2
  fi
fi

systemctl enable --now cfd-sidecar

echo ""
echo "CFD sidecar service is running. Check: systemctl status cfd-sidecar"
echo ""

# Optionally add nginx to docker group for PHP Start fallback
if id nginx &>/dev/null; then
  if groups nginx | grep -q docker; then
    echo "nginx is already in docker group."
  else
    usermod -aG docker nginx
    echo "Added nginx to docker group. Restart php-fpm and nginx for changes to take effect:"
    echo "  sudo systemctl restart php-fpm nginx"
  fi
else
  echo "Note: nginx user not found. If using a different php-fpm user, add it to docker:"
  echo "  sudo usermod -aG docker <php-fpm-user>"
fi
