#!/bin/bash
# Deploy BTS Audit API directly on PVE host via Docker
set -e
echo "=== Deploying BTS Audit API on PVE host ==="

# Clone repo
echo "[1/4] Clone repo..."
cd /root
if [ -d bts-site-audit ]; then
  cd bts-site-audit && git pull
else
  git clone https://github.com/judemakoba/bts-site-audit.git
fi
cd /root/bts-site-audit
mkdir -p data/caddy_config data/caddy_data data/uploads

# Setup env
echo "[2/4] Setup env..."
if [ ! -f .env ] || ! grep -q "JWT_SECRET" .env; then
  echo "JWT_SECRET=ecd5daab14b43fc0387817a8b0241ec49ef0aa5f9da72e9f93896e3f048d3764" > .env
  echo "JWT_EXPIRY=7d" >> .env
  echo "NODE_ENV=production" >> .env
  echo "PORT=3000" >> .env
  echo "ALLOWED_ORIGINS=*" >> .env
fi
cat .env

# Docker build
echo "[3/4] Build Docker image..."
docker build -t bts-api:latest -f backend/Dockerfile backend/ 2>&1 | tail -5

# Run
echo "[4/4] Start container..."
docker rm -f bts-api 2>/dev/null || true
docker run -d \
  --name bts-api \
  --restart unless-stopped \
  -p 3001:3000 \
  -e NODE_ENV=production \
  -e JWT_SECRET=ecd5daab14b43fc0387817a8b0241ec49ef0aa5f9da72e9f93896e3f048d3764 \
  -e JWT_EXPIRY=7d \
  -e ALLOWED_ORIGINS='*' \
  -v /root/bts-site-audit/data/uploads:/app/uploads \
  -v /root/bts-site-audit/data/db.json:/app/data/db.json \
  bts-api:latest \
  2>&1

echo "=== Status ==="
docker ps | grep bts-api
sleep 3
docker logs bts-api --tail=10
curl -s http://localhost:3001/api/health 2>/dev/null || echo "Not ready yet"
