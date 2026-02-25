#!/bin/bash
# Commit and push stable version to main
# Run: bash scripts/commit-push-stable.sh
# If you get "Permission denied" on api files, run: sudo bash scripts/commit-push-stable.sh

set -e
cd "$(dirname "$0")/.."

# Remove files blocking merge (owned by root from earlier chown)
rm -f public_html/api/users-delete.php public_html/api/users-me.php 2>/dev/null || sudo rm -f public_html/api/users-delete.php public_html/api/users-me.php

# Merge stable version into main
git checkout main
git merge 6978cbc -m "Merge stable version" || git reset --hard 6978cbc

# Push to origin
git push origin main

echo "Pushed stable version to main."
