#!/bin/bash
PCT=/usr/sbin/pct
LXC=203
echo "=== Step 1: Encode ==="
base64 /tmp/node.tar.xz > /tmp/node.b64
SZ=$(wc -c < /tmp/node.b64)
echo "Encoded: $SZ bytes"

echo "=== Step 2: Push to LXC ==="
$PCT push $LXC /tmp/node.b64 /tmp/node.b64
$PCT exec $LXC -- bash -c "wc -c < /tmp/node.b64"

echo "=== Step 3: Decode ==="
$PCT exec $LXC -- bash -c "base64 -d /tmp/node.b64 > /tmp/node.tar.xz ; rm /tmp/node.b64"
$PCT exec $LXC -- ls -lh /tmp/node.tar.xz

echo "=== Step 4: Extract ==="
$PCT exec $LXC -- bash -c "cd /usr/local ; tar -xJf /tmp/node.tar.xz ; rm /tmp/node.tar.xz"
$PCT exec $LXC -- bash -c "export PATH=/usr/local/bin:\$PATH ; node --version ; npm --version"

echo "=== Step 5: Clone repo ==="
$PCT exec $LXC -- bash -c "cd /root ; git clone https://github.com/judemakoba/bts-site-audit.git 2>&1 | tail -3"

echo "=== Step 6: Install deps ==="
$PCT exec $LXC -- bash -c "cd /root/bts-site-audit/backend ; npm install --ignore-scripts > /tmp/npm.log 2>&1 ; echo NPM_DONE >> /tmp/npm.log ; cat /tmp/npm.log | tail -5"

echo "=== Step 7: Setup env ==="
$PCT exec $LXC -- bash -c "cd /root/bts-site-audit ; mkdir -p data/uploads ; echo JWT_SECRET=ecd5daab14b43fc0387817a8b0241ec49ef0aa5f9da72e9f93896e3f048d3764 > .env ; echo JWT_EXPIRY=7d >> .env ; echo NODE_ENV=production >> .env ; echo PORT=3000 >> .env ; echo ALLOWED_ORIGINS=* >> .env ; cat .env"

echo "=== Step 8: Start server ==="
$PCT exec $LXC -- bash -c "cd /root/bts-site-audit/backend ; nohup node server.js > /tmp/bts.log 2>&1 &"
sleep 5
$PCT exec $LXC -- bash -c "curl -s http://localhost:3000/api/health 2>&1 || cat /tmp/bts.log | tail -10"
