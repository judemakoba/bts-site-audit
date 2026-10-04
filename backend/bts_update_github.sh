#!/bin/bash
# bts_update.sh — Run on LXC 203 (via pve-mgmt SSH chain) to pull latest backend code
# Run from Git Bash: bash bts_update.sh
set -e

KEY="/c/Users/Jude M/.ssh/id_ed25519"

echo "=== Pulling latest backend code from GitHub ==="
ssh -i "$KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=10 -o BatchMode=yes root@pve-mgmt \
  "sshpass -p 'PVEpass123!' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -o BatchMode=yes root@192.168.1.68 \
    'pct exec 203 -- bash -c \"cd /opt/bts-audit && git pull origin main && echo GIT_PULL_OK\"'"

echo ""
echo "=== Restarting Node.js server ==="
ssh -i "$KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=10 -o BatchMode=yes root@pve-mgmt \
  "sshpass -p 'PVEpass123!' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -o BatchMode=yes root@192.168.1.68 \
    'pct exec 203 -- bash -c \"pkill -f server.js; sleep 1; nohup /usr/local/bin/node /opt/bts-audit/server.js </dev/null >/tmp/node.log 2>&1 & sleep 2; curl -s http://localhost:3000/api/health\"'"

echo ""
echo "=== Done ==="
