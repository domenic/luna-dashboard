#!/usr/bin/env bash
set -euo pipefail

NAS_HOST="domenic@nas.local"
NAS_APP_DIR="/share/AppData/luna"
COMPOSE_DIR="/share/Container/container-station-data/application/homelab"
DOCKER="/share/CACHEDEV1_DATA/.qpkg/container-station/bin/docker"

echo "Copying files to NAS..."
tar cf - \
  --exclude=node_modules \
  --exclude=data.json \
  --exclude=.env \
  --exclude=.git \
  . | ssh "$NAS_HOST" "cd $NAS_APP_DIR && tar xf -"

echo "Building and deploying..."
ssh "$NAS_HOST" "\
  cd $COMPOSE_DIR && \
  sudo $DOCKER compose up -d --build luna-dashboard"

echo "Deployed! http://luna.local/"
