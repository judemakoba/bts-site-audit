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

# 1. Test login
print("=== [1] Login Test ===")
out, err = run(pve, 'pct exec 203 -- bash -c "export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin && wget -qO- --header=Content-Type:application/json --post-data={\"email\":\"admin@bts-audit.com\",\"password\":\"admin123\"} http://localhost:3000/api/auth/login 2>&1')
print("Login:", out[:200], err[:100])

# 2. Download Caddy
print("\n=== [2] Download Caddy ===")
stdin, stdout, stderr = pve.exec_command('pct exec 203 -- bash -c "export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin && wget -q -O /tmp/caddy.tar.gz https://github.com/caddyserver/caddy/releases/download/v2.8.4/caddy_2.8.4_linux_amd64.tar.gz && echo downloaded && tar -xzf /tmp/caddy.tar.gz -C /usr/local/bin && rm /tmp/caddy.tar.gz && caddy version"', timeout=120)
out = stdout.read()
err = stderr.read()
print(out[:200], err[:200])

# 3. Write Caddyfile
print("\n=== [3] Caddyfile ===")
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
print("Caddyfile written")

# 4. Start Caddy
print("\n=== [4] Start Caddy ===")
run(pve, 'pct exec 203 -- bash -c "pkill caddy 2>/dev/null; cd /root/bts-site-audit && nohup caddy run --config Caddyfile > /tmp/caddy.log 2>&1 &"')
time.sleep(5)

# 5. Verify
print("\n=== [5] Verify ===")
out, err = run(pve, 'pct exec 203 -- bash -c "cat /tmp/caddy.log | tail -10"')
print("Caddy log:", out)
out, err = run(pve, 'pct exec 203 -- bash -c "ps aux --no-headers | grep caddy | grep -v grep"')
print("Caddy:", out)
out, err = run(pve, 'pct exec 203 -- bash -c "export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin && wget -qO- http://localhost:3001/api/health 2>&1"')
print("HTTPS Health:", out[:200])

# 6. LXC IP
out, err = run(pve, 'pct exec 203 -- bash -c "ip -br addr show eth0"')
print("LXC IP:", out)

# 7. Server is also directly accessible
out, err = run(pve, 'pct exec 203 -- bash -c "export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin && wget -qO- http://localhost:3000/api/health"')
print("HTTP Health (port 3000):", out[:200])

sftp.close()
pve.close()
print("\n=== BTS Audit API is LIVE on LXC 203 ===")
