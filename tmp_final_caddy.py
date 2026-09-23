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
    return stdout.read().decode(), stderr.read().decode()

pve = ssh_pve()
sftp = pve.open_sftp()

print("[1] Push Caddyfile...")
sftp.put(r'D:\Mop_Projects\Asset_Verification\bts-caddyfix.tar', '/tmp/caddyfix.tar')
out, err = run(pve, 'pct push 203 /tmp/caddyfix.tar /tmp/caddyfix.tar')
print("push:", out or "OK")

print("[2] Extract and restart Caddy...")
run(pve, 'pct exec 203 -- bash -c "pkill caddy 2>/dev/null; sleep 1; cd /root/bts-site-audit && tar -xf /tmp/caddyfix.tar && rm /tmp/caddyfix.tar"')
run(pve, 'pct exec 203 -- bash -c "export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin && cd /root/bts-site-audit && setsid /usr/local/bin/caddy run --config Caddyfile > /tmp/caddy.log 2>&1 &"')
time.sleep(5)

print("[3] Status...")
out, err = run(pve, 'pct exec 203 -- bash -c "ps aux --no-headers | grep caddy | grep -v grep"')
print("Caddy:", out)
out, err = run(pve, 'pct exec 203 -- bash -c "cat /tmp/caddy.log | tail -10"')
print("Log:", out)

print("[4] Health check...")
out, err = run(pve, 'pct exec 203 -- bash -c "export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin && wget -qO- http://localhost:3001/api/health 2>&1"')
print("HTTPS Health (3001):", out)
out, err = run(pve, 'pct exec 203 -- bash -c "ss -tlnp | grep 300"')
print("Ports:", out)

print("[5] Login test...")
out, err = run(pve, 'pct exec 203 -- bash -c "export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin && wget -qO- --post-data=email=admin@bts-audit.com --post-data=password=admin123 --header=Content-Type:application/json http://localhost:3001/api/auth/login 2>&1"')
print("Login:", out[:300])

print("\n=== LXC 203 BTS Audit ===")
print("API: http://192.168.1.203:3001/api/health")
print("Router: forward TCP:3001 -> 192.168.1.203:3001")

pve.close()
