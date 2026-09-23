#!/bin/bash
# ============================================================
# BTS Audit LXC 203 Provisioning Script
# Run ON the PVE host: bash /tmp/provision-bts-lxc.sh
# ============================================================
set -e

echo "=== BTS Audit LXC 203 — Provisioning ==="

# ---- Config ------------------------------------------------
LXC_ID=203
LXC_HOSTNAME=bts-audit
LXC_CORES=2
LXC_MEMORY=1024
LXC_SWAP=512
LXC_DISK_SIZE=20
LXC_IP=192.168.1.203
LXC_GW=192.168.1.1
LXC_BRIDGE=vmbr0
LXC_MASK=BC:24:11:66:35:FF
STORAGE=local-lvm
TEMPLATE="local:vztmpl/debian-12-standard_12.12-1_amd64.tar.zst"
# -----------------------------------------------------------

# 1. Check if LXC already exists
if pct list 2>/dev/null | grep -q "^${LXC_ID} "; then
  echo "LXC ${LXC_ID} already exists."
  pct status ${LXC_ID}
  echo "To destroy and recreate: pct destroy ${LXC_ID} --purge"
  exit 0
fi

echo "[1/6] Creating LXC ${LXC_ID} (${LXC_IP})..."

pct create ${LXC_ID} ${TEMPLATE} \
  --hostname ${LXC_HOSTNAME} \
  --memory ${LXC_MEMORY} \
  --cores ${LXC_CORES} \
  --swap ${LXC_SWAP} \
  --rootfs ${STORAGE}:${LXC_DISK_SIZE} \
  --net0 name=eth0,bridge=${LXC_BRIDGE},gw=${LXC_GW},ip=${LXC_IP}/24,hwaddr=${LXC_MASK},type=veth \
  --features nesting=1,fuse=1,keyctl=1 \
  --unprivileged 1 \
  --onboot 1 \
  --timezone Africa/Kampala \
  --tags bts-audit:community-script

echo "✅ LXC ${LXC_ID} created"

echo "[2/6] Starting LXC..."
pct start ${LXC_ID}
sleep 15

if pct status ${LXC_ID} | grep -q "running"; then
  echo "✅ LXC ${LXC_ID} is running"
else
  echo "❌ LXC ${LXC_ID} failed to start. Run: pct status ${LXC_ID}"
  exit 1
fi

echo "[3/6] Installing Docker inside LXC ${LXC_ID}..."
pct exec ${LXC_ID} -- bash -c "
  set -e
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg lsb-release > /dev/null 2>&1

  # Docker GPG key
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  # Docker repo (bookworm = Debian 12)
  echo 'deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian bookworm stable' > /etc/apt/sources.list.d/docker.list

  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin > /dev/null 2>&1

  systemctl enable docker
  systemctl start docker

  echo 'Docker installed:'
  docker --version
  docker compose version
"

echo "[4/6] Installing essential tools..."
pct exec ${LXC_ID} -- bash -c "
  apt-get install -y -qq git htop vim curl wget unzip > /dev/null 2>&1
  echo '✅ Tools installed'
"

echo "[5/6] Cloning BTS Audit repo..."
pct exec ${LXC_ID} -- bash -c "
  cd /root
  if [ -d bts-site-audit ]; then
    cd bts-site-audit && git pull
    echo '✅ Repo updated'
  else
    git clone https://github.com/judemakoba/bts-site-audit.git
    echo '✅ Repo cloned'
  fi
"

echo "[6/6] Starting BTS Audit stack..."
pct exec ${LXC_ID} -- bash -c "
  cd /root/bts-site-audit
  mkdir -p data/caddy_config data/caddy_data data/uploads data

  # Set JWT_SECRET
  export JWT_SECRET=\$(cat /root/bts-site-audit/.env 2>/dev/null | grep JWT_SECRET | cut -d= -f2)
  if [ -z \"\$JWT_SECRET\" ]; then
    echo 'JWT_SECRET not set — generating one...'
    export JWT_SECRET=\$(openssl rand -hex 32)
    echo \"JWT_SECRET=\$JWT_SECRET\" > /root/bts-site-audit/.env
  fi

  docker compose up -d --build
  echo '✅ Stack started'
  sleep 10
  docker compose ps
  docker compose logs --tail=30
"

echo ""
echo "=== Provisioning Complete ==="
echo "LXC ${LXC_ID} running at: ${LXC_IP}"
echo ""
echo "Next steps:"
echo "  1. Set port forward on your router: ext:3001 → ${LXC_IP}:443 (TCP)"
echo "  2. Access via: https://YOUR_PUBLIC_IP:3001/api/health"
echo ""
echo "To manage:"
echo "  pct enter ${LXC_ID}              — shell into LXC"
echo "  pct exec ${LXC_ID} -- docker compose -f /root/bts-site-audit/docker-compose.yml logs -f  — live logs"
echo "  pct stop ${LXC_ID} / pct start ${LXC_ID}   — stop/start"
