#!/bin/bash
# ============================================================
# BTS Audit LXC 203 Provisioning Script
# Run this ON the PVE host (root@pve / 192.168.1.68)
# ============================================================
set -e

echo "=== BTS Audit LXC 203 — Provisioning ==="
echo ""

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
STORAGE=local-lvm
# -----------------------------------------------------------

# 1. Check if LXC already exists
if pct list | grep -q "^${LXC_ID} "; then
  echo "LXC ${LXC_ID} already exists. Checking status..."
  pct status ${LXC_ID}
  echo "If you want to recreate, run: pct destroy ${LXC_ID} --purge"
  exit 0
fi

echo "[1/6] Creating LXC ${LXC_ID} (${LXC_IP})..."

# Download Debian 12 template if not present
if [ ! -f /var/lib/vz/template/ubuntu/debian-12-standard.tar.gz ]; then
  echo "Downloading Debian 12 template..."
  mkdir -p /var/lib/vz/template/ubuntu
  cd /var/lib/vz/template/ubuntu
  wget -q https://ftp.debian.org/debian/dists/bookworm/main/installer-amd64/current/images/netboot/debian-installer/amd64/linux -O linux
  wget -q https://ftp.debian.org/debian/dists/bookworm/main/installer-amd64/current/images/netboot/debian-installer/amd64/initrd.gz -O initrd.gz
  # Use community template download
  echo "Using community Debian 12 template..."
  pveam download local debian-12-standard_amd64.tar.gz 2>/dev/null || true
fi

# Create LXC
pct create ${LXC_ID} local:vztmpl/debian-12-standard_amd64.tar.gz \
  --hostname ${LXC_HOSTNAME} \
  --memory ${LXC_MEMORY} \
  --cores ${LXC_CORES} \
  --swap ${LXC_SWAP} \
  --rootfs ${STORAGE}:${LXC_DISK_SIZE} \
  --net0 name=eth0,bridge=${LXC_BRIDGE,gw=${LXC_GW},ip=${LXC_IP}/24,type=veth \
  --features nesting=1,fuse=1,keyctl=1 \
  --unprivileged 1 \
  --onboot 1 \
  --timezone Africa/Kampala \
  --tags bts-audit,community-script \
  2>&1 | head -20

# Alternative: create via startvm with config
if ! pct list | grep -q "^${LXC_ID} "; then
  echo "Trying alternative LXC creation method..."
  # Create LXC config manually
  cat > /etc/pve/lxc/${LXC_ID}.conf <<EOF
arch: amd64
cores: ${LXC_CORES}
features: nesting=1,fuse=1,keyctl=1
hostname: ${LXC_HOSTNAME}
memory: ${LXC_MEMORY}
net0: name=eth0,bridge=${LXC_BRIDGE},gw=${LXC_GW},hwaddr=BC:24:11:66:35:FF,ip=${LXC_IP}/24,type=veth
onboot: 1
ostype: debian
rootfs: ${STORAGE}:vm-${LXC_ID}-disk-0,size=${LXC_DISK_SIZE}G
swap: ${LXC_SWAP}
tags: bts-audit;community-script
timezone: Africa/Kampala
unprivileged: 1
lxc.cgroup2.devices.allow: c 10:200 rwm
lxc.mount.entry: /dev/net/tun dev/net/tun none bind,create=file
EOF

  # Allocate disk
  qm importdisk ${LXC_ID} none ${STORAGE} --format raw 2>/dev/null || \
  pct alloc ${LXC_ID} ${STORAGE} vm-${LXC_ID}-disk-0 ${LXC_DISK_SIZE}G 2>/dev/null || \
  echo "Disk allocation may need manual intervention"

  # Start LXC
  pct start ${LXC_ID} 2>&1 || echo "LXC start may need manual intervention"
fi

echo "[2/6] Waiting for LXC ${LXC_ID} to boot..."
sleep 10

# Check if running
if pct status ${LXC_ID} | grep -q "running"; then
  echo "✅ LXC ${LXC_ID} is running"
else
  echo "⚠️  LXC ${LXC_ID} may not be running. Check: pct status ${LXC_ID}"
fi

echo "[3/6] Installing Docker inside LXC ${LXC_ID}..."
pct exec ${LXC_ID} -- bash -c "
  set -e
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg lsb-release > /dev/null 2>&1

  # Add Docker GPG key
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  # Add Docker repo
  echo 'deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian bookworm stable' > /etc/apt/sources.list.d/docker.list

  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin > /dev/null 2>&1

  # Enable and start Docker
  systemctl enable docker
  systemctl start docker

  echo '✅ Docker installed'
  docker --version
  docker compose version
"

echo "[4/6] Installing essential tools..."
pct exec ${LXC_ID} -- bash -c "
  apt-get install -y -qq git htop vim curl wget unzip 2>/dev/null
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
  docker compose -f docker-compose.yml up -d --build
  echo '✅ Stack started'
  sleep 5
  docker compose -f docker-compose.yml ps
  docker compose -f docker-compose.yml logs --tail=20
"

echo ""
echo "=== Provisioning Complete ==="
echo "LXC ${LXC_ID} (${LXC_IP}) — BTS Audit API"
echo "Health check: https://${LXC_IP}/api/health"
echo ""
echo "Next: Set port forward on your router:"
echo "  External port: 3001"
echo "  Internal IP: ${LXC_IP}"
echo "  Internal port: 443"
echo ""
echo "To manage from PVE host:"
echo "  pct enter ${LXC_ID}     — enter the LXC shell"
echo "  pct stop ${LXC_ID}      — stop"
echo "  pct start ${LXC_ID}     — start"
echo "  docker compose -f /root/bts-site-audit/docker-compose.yml logs -f  — view logs"
