#!/bin/bash
# Fix Docker permission denied. Run with: sudo ./setup-docker-permissions.sh
# Adds current user and nginx (php-fpm) to docker group for CFD sidecar.
# After running: log out and back in (or newgrp docker). Restart php-fpm and nginx.
if [ "$EUID" -ne 0 ]; then
  echo "Run with sudo: sudo $0"
  exit 1
fi
USER="${SUDO_USER:-$USER}"
usermod -aG docker "$USER"
echo "Added $USER to docker group. Log out and back in, or run: newgrp docker"

# Add nginx (php-fpm user) so PHP Start button can spawn sidecar when service is not used
if id nginx &>/dev/null; then
  if groups nginx | grep -q docker; then
    echo "nginx is already in docker group."
  else
    usermod -aG docker nginx
    echo "Added nginx to docker group. Restart for changes: sudo systemctl restart php-fpm nginx"
  fi
else
  echo "Note: nginx user not found. If using a different php-fpm user (e.g. www-data), add it: sudo usermod -aG docker <user>"
fi
