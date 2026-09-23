#!/bin/bash
set -e
echo "=== BTS Audit Deploy ==="

# 1. Clone repo
echo "[1/5] Cloning repo..."
cd /root
if [ -d bts-site-audit ]; then
  cd bts-site-audit && git pull
else
  git clone https://github.com/judemakoba/bts-site-audit.git
fi
cd /root/bts-site-audit
echo "Repo ready"

# 2. Create data directories
echo "[2/5] Creating data directories..."
mkdir -p data/caddy_config data/caddy_data data/uploads data
echo "Directories ready"

# 3. Generate JWT secret if not set
echo "[3/5] Setting JWT_SECRET..."
if [ ! -f .env ] || ! grep -q "JWT_SECRET" .env; then
  SECRET=$(openssl rand -hex 32)
  echo "JWT_SECRET=$SECRET" > .env
  echo "JWT_EXPIRY=7d" >> .env
  echo "NODE_ENV=production" >> .env
  echo "PORT=3000" >> .env
  echo "ALLOWED_ORIGINS=*" >> .env
  echo "JWT_SECRET generated: $SECRET"
else
  echo "JWT_SECRET already set"
fi

# 4. Build and start stack
echo "[4/5] Building Docker images..."
docker compose up -d --build 2>&1 | tail -5

echo "[5/5] Waiting for services..."
sleep 30

# 5. Verify
echo "=== Status ==="
docker compose ps
echo ""
echo "=== Recent Logs ==="
docker compose logs --tail=15
echo ""
echo "=== Health Check ==="
curl -s http://localhost:3000/api/health 2>/dev/null || echo "API not responding yet — may need more time"
