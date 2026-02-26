#!/bin/bash
# Build Tailwind CSS (no Node.js required - uses standalone CLI)
# Run from project root: bash scripts/build-tailwind.sh
set -e
cd "$(dirname "$0")/.."

if [ ! -f ./tailwindcss ]; then
  echo "Downloading Tailwind standalone CLI..."
  curl -sL "https://github.com/tailwindlabs/tailwindcss/releases/download/v3.4.17/tailwindcss-linux-x64" -o tailwindcss
  chmod +x tailwindcss
fi

./tailwindcss -i ./public_html/css/tailwind-input.css -o ./public_html/css/tailwind.css --minify
echo "Built public_html/css/tailwind.css"
