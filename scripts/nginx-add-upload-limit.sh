#!/bin/bash
# Fix 413: Add client_max_body_size 50m and bump PHP limits for city image uploads
# Run: sudo bash scripts/nginx-add-upload-limit.sh

CONF="/etc/nginx/conf.d/app-guillaumelassiat-nginx.conf"

# Add nginx client_max_body_size after server_name (inside the HTTPS block)
if ! grep -q "client_max_body_size" "$CONF"; then
  sudo sed -i '/server_name app.guillaumelassiat.com;/a\    client_max_body_size 50m;' "$CONF"
  echo "Added client_max_body_size 50m"
fi

# Bump PHP upload limits from 10M to 50M
sudo sed -i 's/upload_max_filesize=10M/upload_max_filesize=50M/g' "$CONF"
sudo sed -i 's/post_max_size=10M/post_max_size=50M/g' "$CONF"

sudo nginx -t && sudo systemctl reload nginx && echo "Nginx reloaded OK"
