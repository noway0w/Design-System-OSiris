#!/bin/bash
# Install PHP GD extension (required for city-image-batch.php)
# Run: sudo bash scripts/install-php-gd.sh

if php -m 2>/dev/null | grep -qi gd; then
  echo "PHP GD already installed"
  exit 0
fi

# RHEL/CentOS/Rocky/Alma
if command -v dnf &>/dev/null; then
  sudo dnf install -y php-gd
elif command -v yum &>/dev/null; then
  sudo yum install -y php-gd
# Debian/Ubuntu
elif command -v apt-get &>/dev/null; then
  sudo apt-get update && sudo apt-get install -y php-gd
else
  echo "Unknown package manager. Install php-gd manually."
  exit 1
fi

sudo systemctl restart php-fpm 2>/dev/null || sudo systemctl restart php8.0-fpm 2>/dev/null || true
echo "Done. Verify with: php -m | grep -i gd"
