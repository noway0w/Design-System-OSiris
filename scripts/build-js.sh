#!/bin/bash
# Build map-app.min.js (no Node.js required - uses esbuild standalone)
# Run from project root: bash scripts/build-js.sh
set -e
cd "$(dirname "$0")/.."

ESBUILD_VERSION="0.24.2"
ESBUILD_DIR=".esbuild-bin"

if [ ! -f "$ESBUILD_DIR/esbuild" ]; then
  echo "Downloading esbuild standalone..."
  mkdir -p "$ESBUILD_DIR"
  curl -sL "https://registry.npmjs.org/@esbuild/linux-x64/-/linux-x64-${ESBUILD_VERSION}.tgz" -o "$ESBUILD_DIR/esbuild.tgz"
  tar -xzf "$ESBUILD_DIR/esbuild.tgz" -C "$ESBUILD_DIR"
  mv "$ESBUILD_DIR/package/bin/esbuild" "$ESBUILD_DIR/esbuild"
  chmod +x "$ESBUILD_DIR/esbuild"
  rm -rf "$ESBUILD_DIR/package" "$ESBUILD_DIR/esbuild.tgz"
fi

./"$ESBUILD_DIR/esbuild" public_html/js/map-app.js --minify --outfile=public_html/js/map-app.min.js
echo "Built public_html/js/map-app.min.js"
