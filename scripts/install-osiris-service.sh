#!/usr/bin/env bash
# Bootstrap venv, install Python deps, install systemd units, enable services.
# Run with sudo: sudo bash /home/OSiris/scripts/install-osiris-service.sh

set -euo pipefail
ROOT="/home/OSiris/osiris-service"
PY="${ROOT}/venv/bin/python"
PIP="${ROOT}/venv/bin/pip"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo bash $0"
  exit 1
fi

if ! id OSiris &>/dev/null; then
  echo "User OSiris not found."
  exit 1
fi

echo "==> Python venv"
sudo -u OSiris python3 -m venv "${ROOT}/venv"
sudo -u OSiris "${PIP}" install --upgrade pip wheel

echo "==> System packages for dlib (RHEL/Fedora)"
if command -v dnf &>/dev/null; then
  dnf install -y cmake gcc-c++ python3-devel openblas-devel || true
fi

echo "==> pip install (may take several minutes for dlib)"
sudo -u OSiris "${PIP}" install -r "${ROOT}/requirements.txt"

echo "==> systemd"
cp /home/OSiris/scripts/osiris-server.service /etc/systemd/system/
cp /home/OSiris/scripts/osiris-manager.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable osiris-server osiris-manager
systemctl restart osiris-server
sleep 2
systemctl restart osiris-manager

echo "==> status"
systemctl --no-pager status osiris-server osiris-manager || true

echo ""
echo "Services (user session, or use system units in /etc/systemd/system/ with sudo):"
echo "  systemctl --user enable --now osiris-server osiris-manager"
echo "  loginctl enable-linger OSiris   # survive logout (once)"
echo ""
echo "Nginx: copy location blocks from scripts/osiris-nginx-websocket-snippet.conf"
echo "  into BOTH port 80 and 443 server blocks if you use TLS, then:"
echo "  sudo nginx -t && sudo systemctl reload nginx"
echo "Check: ss -tln | grep -E '8878|8880|8881'"
