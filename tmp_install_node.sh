#!/bin/bash
set -e
echo "=== BTS Audit — Node.js Direct Install ==="

# 1. Install Node.js 20
echo "[1/4] Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /tmp/node_install.log 2>&1
apt-get install -y nodejs > /tmp/node_install2.log 2>&1
node --version
npm --version

# 2. Clone repo
echo "[2/4] Cloning repo..."
cd /root
if [ -d bts-site-audit ]; then
  cd bts-site-audit && git pull
else
  git clone https://github.com/judemakoba/bts-site-audit.git
fi

# 3. Setup
cd /root/bts-site-audit
mkdir -p data/caddy_config data/caddy_data data/uploads

# 4. Set JWT_SECRET
if [ ! -f .env ] || ! grep -q "JWT_SECRET" .env; then
  SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | xxd -p -c 256)
  echo "JWT_SECRET=$SECRET" > .env
  echo "JWT_EXPIRY=7d" >> .env
  echo "NODE_ENV=production" >> .env
  echo "PORT=3000" >> .env
  echo "ALLOWED_ORIGINS=*" >> .env
fi

# 5. Install deps + start
echo "[3/4] Installing dependencies..."
cd /root/bts-site-audit/backend
npm install --ignore-scripts > /tmp/npm_install.log 2>&1

echo "[4/4] Starting server..."
# Start in background, log to file
nohup node server.js > /tmp/bts-server.log 2>&1 &
echo $! > /tmp/bts-server.pid

echo "Waiting 5s for server to start..."
sleep 5

# 6. Verify
echo "=== Status ==="
cat /tmp/bts-server.log
echo ""
echo "=== Health Check ==="
curl -s http://localhost:3000/api/health 2>/dev/null || echo "Not responding yet — check /tmp/bts-server.log"
echo ""
echo "=== PID ==="
cat /tmp/bts-server.pid
