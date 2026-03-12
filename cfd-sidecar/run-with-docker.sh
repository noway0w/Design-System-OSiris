#!/bin/bash
# Run the CFD sidecar with Docker group access (no logout required after usermod -aG docker).
# Use: npm run start:docker  or  ./run-with-docker.sh
cd "$(dirname "$0")"
# sg docker runs with docker group; needed when current shell doesn't have it yet
exec sg docker -c "node server.js"
