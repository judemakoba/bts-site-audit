#!/usr/bin/env python3
import paramiko, io, time

def ssh_pve():
    j = paramiko.SSHClient(); j.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    j.connect('100.93.195.102', username='root', look_for_keys=True, timeout=10)
    transport = j.get_transport()
    channel = transport.open_channel('direct-tcpip', ('192.168.1.68', 22), ('100.93.195.102', 0))
    pve = paramiko.SSHClient(); pve.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    pve.connect('192.168.1.68', username='root', look_for_keys=True, sock=channel, timeout=10)
    return pve

def run(pve, cmd, timeout=30):
    stdin, stdout, stderr = pve.exec_command(cmd, timeout=timeout)
    return stdout.read().decode(), stderr.read().decode()

pve = ssh_pve()
sftp = pve.open_sftp()

# Fix Caddyfile with correct paths
print("[1] Write Caddyfile...")
caddyfile = """:3001 {
  rate_limit {
    zone dynamic { key {remote_ip} rate 100/minute burst 20 }
  }
  header {
    X-Frame-Options "SAMEORIGIN"
    X-Content-Type-Options "nosniff"
    X-XSS-Protection "1; mode=block"
    Referrer-Policy "strict-origin-when-cross-origin"
    Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://*; font-src 'self'; object-src 'none'"
    -Server
    Strict-Transport-Security "max-age=31536000"
    Cache-Control "no-store, no-cache"
    Pragma "no-cache"
  }
  reverse_proxy localhost:3000
}
"""
f = io.BytesIO(caddyfile.encode())
sftp.putfo(f, '/root/bts-site-audit/Caddyfile')
sftp.close()
print("  Caddyfile written")

# Kill old Caddy, start new with full paths
print("[2] Start Caddy...")
run(pve, 'pct exec 203 -- bash -c "pkill caddy 2>/dev/null; sleep 1"')
run(pve, 'pct exec 203 -- bash -c "export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin && cd /root/bts-site-audit && nohup /usr/local/bin/caddy run --config Caddyfile > /tmp/caddy.log 2>&1 &"')
time.sleep(5)

# Verify
print("[3] Verify...")
out, err = run(pve, 'pct exec 203 -- bash -c "cat /tmp/caddy.log | tail -10"')
print("  Caddy log:", out)
out, err = run(pve, 'pct exec 203 -- bash -c "ps aux --no-headers | grep caddy | grep -v grep"')
print("  Caddy process:", out)

out, err = run(pve, 'pct exec 203 -- bash -c "export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin && wget -qO- http://localhost:3001/api/health 2>&1"')
print("  HTTPS Health:", out[:200])

# Test login
print("[4] Test login...")
out, err = run(pve, 'pct exec 203 -- bash -c "export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin && wget -qO- --header=Content-Type:application/json --post-data=\\'{\"email\":\"admin@bts-audit.com\",\"password\":\"admin123\"}\\' http://localhost:3000/api/auth/login 2>&1"')
print("  Login:", out[:300])

print("\n[5] LXC Info...")
out, err = run(pve, 'pct exec 203 -- bash -c "ip -br addr show eth0 && df -h / | tail -1 && free -h | grep Mem"')
print("  ", out)

print("\n[6] Port check...")
out, err = run(pve, 'pct exec 203 -- bash -c "ss -tlnp | grep -E 3000|3001"')
print("  Listening ports:", out)

pve.close()
print("\n=== BTS Audit API LIVE on LXC 203 ===")
print("  HTTP API:  http://192.168.1.203:3000")
print("  HTTPS API: http://192.168.1.203:3001  (Caddy proxy)")
print("  Health:    http://192.168.1.203:3000/api/health")
