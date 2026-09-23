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

# Push new Caddyfile
print("[1] Push Caddyfile...")
sftp.put(r'D:\Mop_Projects\Asset_Verification\bts-caddyfix.tar', '/tmp/caddyfix.tar')
out, err = run(pve, 'pct push 203 /tmp/caddyfix.tar /tmp/caddyfix.tar 2>&1')
print("pct push:", out or "OK")

# Extract
print("[2] Extract...")
out, err = run(pve, 'pct exec 203 -- bash -c "cd /root/bts-site-audit && tar -xf /tmp/caddyfix.tar && rm /tmp/caddyfix.tar && cat Caddyfile"')
print("Caddyfile:", out)

# Kill old Caddy, start new
print("[3] Restart Caddy...")
run(pve, 'pct exec 203 -- bash -c "pkill caddy 2>/dev/null; sleep 1"')
run(pve, 'pct exec 203 -- bash -c "export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin && cd /root/bts-site-audit && setsid /usr/local/bin/caddy run --config Caddyfile > /tmp/caddy.log 2>&1 &"')
time.sleep(5)

print("[4] Verify...")
out, err = run(pve, 'pct exec 203 -- bash -c "ps aux --no-headers | grep caddy | grep -v grep"')
print("Caddy:", out)
out, err = run(pve, 'pct exec 203 -- bash -c "cat /tmp/caddy.log | tail -10"')
print("Log:", out)
out, err = run(pve, 'pct exec 203 -- bash -c "export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin && wget -qO- http://localhost:3001/api/health 2>&1"')
print("HTTPS Health (port 3001):", out[:200])
out, err = run(pve, 'pct exec 203 -- bash -c "ss -tlnp | grep 300"')
print("Ports:", out)

# Test login via port 3001
print("[5] Test login...")
out, err = run(pve, 'pct exec 203 -- bash -c "export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin && wget -qO- --header=Content-Type:application/json --post-data=email=admin@bts-audit.com --post-data=password=admin123 http://localhost:3001/api/auth/login 2>&1"')
print("Login:", out[:300])

pve.close()
print("\n=== BTS Audit API LIVE on LXC 203 ===")
print("  Local HTTP:  http://192.168.1.203:3000")
print("  Caddy Proxy: http://192.168.1.203:3001")
print("  Set router port forward: 3001 -> 192.168.1.203:3001 (TCP)")
