#!/usr/bin/env python3
import paramiko, time

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
    return stdout.read().decode().strip(), stderr.read().decode().strip()

pve = ssh_pve()

# Test login with proper JSON POST
print("[1] Test login...")
out, err = run(pve, 'pct exec 203 -- bash -c "export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin && wget -qO- --header=\\'Content-Type: application/json\\' --post-data=\\'{\\\"email\\\":\\\"admin@bts-audit.com\\\",\\\"password\\\":\\\"admin123\\\"}\\' http://localhost:3000/api/auth/login 2>&1"')
print(f"  Login: {out}")

# Install Caddy
print("[2] Install Caddy...")
stdin, stdout, stderr = pve.exec_command(
    'pct exec 203 -- bash -c "export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin && wget -qO /tmp/caddy.tar.gz https://github.com/caddyserver/caddy/releases/download/v2.8.4/caddy_2.8.4_linux_amd64.tar.gz 2>&1 && echo DOWNLOAD_OK && tar -xzf /tmp/caddy.tar.gz -C /usr/local/bin && rm /tmp/caddy.tar.gz && caddy version 2>&1"',
    timeout=120
)
out = stdout.read().decode()
err = stderr.read().decode()
print(f"  {out} {err}")

# Configure Caddyfile
print("[3] Configure Caddyfile...")
caddyfile = """:3001 {
  # Rate limiting
  rate_limit {
    zone dynamic {
      key {remote_ip}
      rate 100/minute
      burst 20
    }
  }

  # Security headers
  header {
    X-Frame-Options "SAMEORIGIN"
    X-Content-Type-Options "nosniff"
    X-XSS-Protection "1; mode=block"
    Referrer-Policy "strict-origin-when-cross-origin"
    Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://*; font-src 'self'; object-src 'none'; frame-ancestors 'none'"
    -Server
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()"
    Cache-Control "no-store, no-cache"
    Pragma "no-cache"
  }

  reverse_proxy localhost:3000
}
"""
# Write Caddyfile
import io
f = io.BytesIO(caddyfile.encode())
sftp = pve.open_sftp()
sftp.putfo(f, '/root/bts-site-audit/Caddyfile')
sftp.close()
print("  Caddyfile written")

# Start Caddy
print("[4] Start Caddy...")
run(pve, 'pct exec 203 -- bash -c "pkill caddy 2>/dev/null; cd /root/bts-site-audit && nohup caddy run --config Caddyfile > /tmp/caddy.log 2>&1 &"')
time.sleep(5)

# Check Caddy
print("[5] Caddy status...")
out, err = run(pve, 'pct exec 203 -- bash -c "cat /tmp/caddy.log | tail -10"')
print(f"  Log: {out}")
out, err = run(pve, 'pct exec 203 -- bash -c "ps aux --no-headers | grep caddy | grep -v grep"')
print(f"  Caddy process: {out}")
out, err = run(pve, 'pct exec 203 -- bash -c "wget -qO- http://localhost:3001/api/health 2>&1"')
print(f"  HTTPS Health: {out}")
out, err = run(pve, 'pct exec 203 -- bash -c "curl -s http://localhost:3001/api/health 2>&1"')
print(f"  HTTPS Health (curl): {out}")

# Get LXC IP
print("[6] LXC 203 IP...")
out, err = run(pve, 'pct exec 203 -- bash -c "ip -br addr show eth0 2>&1"')
print(f"  IP: {out}")

pve.close()
print("\n=== LXC 203 BTS Audit API is LIVE ===")
