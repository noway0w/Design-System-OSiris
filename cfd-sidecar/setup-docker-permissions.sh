#!/bin/bash
# Fix Docker permission denied. Run with: sudo ./setup-docker-permissions.sh
# Then log out and back in (or run: newgrp docker)
if [ "$EUID" -ne 0 ]; then
  echo "Run with sudo: sudo $0"
  exit 1
fi
USER="${SUDO_USER:-$USER}"
usermod -aG docker "$USER"
echo "Added $USER to docker group. Log out and back in, or run: newgrp docker"
