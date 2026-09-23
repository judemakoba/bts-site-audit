#!/usr/bin/env python3
import paramiko, io

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

# Check caddy binary
print("Caddy binary:")
out, err = run(pve, 'pct exec 203 -- bash -c "ls -la /usr/local/bin/caddy && file /usr/local/bin/caddy"')
print(out, err)

# Test caddy directly
print("\nCaddy version:")
out, err = run(pve, 'pct exec 203 -- bash -c "export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin && /usr/local/bin/caddy version 2>&1"')
print(out, err)

# Check if caddy can bind to port 3001 (non-root needs NET_BIND_SERVICE)
print("\nCaddy capabilities:")
out, err = run(pve, 'pct exec 203 -- bash -c "getcap /usr/local/bin/caddy 2>&1 || echo no_caps"')
print(out, err)

# Use a different port (3001) - might need to run as root
# Check if port 3001 is available
print("\nPort check:")
out, err = run(pve, 'pct exec 203 -- bash -c "ss -tlnp | grep 300"')
print(out, err)

# Try running caddy with explicit config path
print("\nStart caddy with direct path:")
run(pve, 'pct exec 203 -- bash -c "export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin && cd /root/bts-site-audit && /usr/local/bin/caddy run --config Caddyfile 2>&1 | head -20 &"')
import time; time.sleep(3)
out, err = run(pve, 'pct exec 203 -- bash -c "cat /tmp/caddy.log | tail -10"')
print("Log:", out)
out, err = run(pve, 'pct exec 203 -- bash -c "ps aux --no-headers | grep caddy | grep -v grep"')
print("Caddy:", out)
out, err = run(pve, 'pct exec 203 -- bash -c "export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin && wget -qO- http://localhost:3001/api/health 2>&1"')
print("HTTPS health:", out[:200])

pve.close()
