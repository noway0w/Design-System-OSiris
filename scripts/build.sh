#!/bin/bash
# Build all production assets (Tailwind CSS + map-app.min.js)
# No Node.js required - uses standalone binaries
# Run from project root: bash scripts/build.sh
set -e
cd "$(dirname "$0")/.."

echo "=== Building Tailwind CSS ==="
bash scripts/build-tailwind.sh

echo ""
echo "=== Building map-app.min.js ==="
bash scripts/build-js.sh

echo ""
echo "Done. Assets: public_html/css/tailwind.css, public_html/js/map-app.min.js"
