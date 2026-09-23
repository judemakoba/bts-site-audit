#!/bin/bash
set -e
echo "[1] Updating apt..."
apt-get update -qq
echo "[2] Installing docker.io..."
DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io > /tmp/docker_install.log 2>&1
echo "[3] Enabling Docker..."
systemctl enable docker 2>/dev/null || true
systemctl start docker 2>/dev/null || true
echo "[4] Verifying..."
docker --version
docker compose version
echo "DOCKER_INSTALLED=ok" >> /tmp/install_status.txt
cat /tmp/install_status.txt
