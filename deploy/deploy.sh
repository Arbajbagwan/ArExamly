#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   APP_DIR=/var/www/arexamly ./deploy/deploy.sh
# Optional:
#   BRANCH=main API_NAME=arexamly-api ./deploy/deploy.sh

APP_DIR="${APP_DIR:-/var/www/arexamly}"
BRANCH="${BRANCH:-main}"
API_NAME="${API_NAME:-arexamly-api}"

echo "[deploy] app_dir=${APP_DIR} branch=${BRANCH} api_name=${API_NAME}"

cd "${APP_DIR}"

if [[ ! -d .git ]]; then
  echo "[deploy] error: ${APP_DIR} is not a git repo"
  exit 1
fi

echo "[deploy] fetching latest code"
git fetch origin "${BRANCH}"
git reset --hard "origin/${BRANCH}"

echo "[deploy] install backend deps"
cd server
npm ci --omit=dev
cd ..

echo "[deploy] build frontend"
cd client
npm ci
npm run build
cd ..

echo "[deploy] restart pm2 app"
if pm2 describe "${API_NAME}" >/dev/null 2>&1; then
  pm2 reload "${API_NAME}" --update-env
else
  pm2 start ecosystem.config.js --only "${API_NAME}" --env production
fi

pm2 save
echo "[deploy] done"
