#!/bin/bash
# start_bts.sh — Auto-starts BTS Audit services on LXC 203 boot
# Pull latest code from GitHub, then start all services

set -e
APP_DIR="/opt/bts-audit"
LOG="/tmp/bts-start.log"

log() { echo "[$(date)] $1" | tee -a "$LOG"; }

log "=== BTS Audit Start Script ==="

cd "$APP_DIR" || exit 1

# Pull latest code from GitHub (auto-update on reboot)
if [ -d ".git" ]; then
    log "Pulling latest code from GitHub..."
    git pull origin main >> "$LOG" 2>&1 || log "Git pull failed (may be up to date or no network)"
fi

# Kill existing processes
pkill -f "node.*server.js" 2>/dev/null || true
pkill -f caddy 2>/dev/null || true
sleep 1

# Start Node.js
log "Starting Node.js server..."
nohup /usr/local/bin/node "$APP_DIR/server.js" </dev/null >> /tmp/node.log 2>&1 &
NODE_PID=$!
log "Node.js started (PID: $NODE_PID)"

# Wait for Node.js to be ready
sleep 2
if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
    log "Node.js health OK"
else
    log "WARNING: Node.js health check failed"
fi

# Start Caddy (reverse proxy on :8080 → :3000)
log "Starting Caddy..."
nohup /usr/local/bin/caddy run --config /etc/Caddyfile --adapter caddyfile >> /tmp/caddy.log 2>&1 &
CADDY_PID=$!
log "Caddy started (PID: $CADDY_PID)"

# Start Funnel (public HTTPS)
log "Starting Tailscale Funnel..."
/usr/local/bin/tailscale --socket=/var/run/tailscale/tailscaled.sock funnel 8080 >> "$LOG" 2>&1 &
FUNNEL_PID=$!
log "Funnel started (PID: $FUNNEL_PID)"

log "=== All services started ==="
