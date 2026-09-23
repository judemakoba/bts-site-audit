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

# Kill any old node process
print("[1] Kill old server...")
run(pve, 'pct exec 203 -- bash -c "pkill -f node 2>/dev/null; echo killed"')

# npm install with correct PATH
print("[2] npm install...")
stdin, stdout, stderr = pve.exec_command(
    'pct exec 203 -- bash -c "export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin && cd /root/bts-site-audit/backend && npm install --ignore-scripts 2>&1"',
    timeout=180
)
out = stdout.read().decode()
err = stderr.read().decode()
print(f"  stdout tail: {out.strip()[-600:]}")
if err.strip():
    print(f"  stderr: {err.strip()[-200:]}")

# Check if dotenv was installed
print("[3] Check installed packages...")
out, err = run(pve, 'pct exec 203 -- bash -c "ls /root/bts-site-audit/backend/node_modules/ | head -20"')
print(f"  Packages: {out}")

# Start server with correct PATH
print("[4] Start server...")
run(pve, 'pct exec 203 -- bash -c "export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin && cd /root/bts-site-audit/backend && nohup node server.js > /tmp/bts.log 2>&1 &"')
time.sleep(6)

print("[5] Health check...")
out, err = run(pve, 'pct exec 203 -- bash -c "cat /tmp/bts.log | tail -20"')
print(f"  Log: {out}")
out, err = run(pve, 'pct exec 203 -- bash -c "ps aux --no-headers | grep node | grep -v grep"')
print(f"  Node processes: {out}")
out, err = run(pve, 'pct exec 203 -- bash -c "curl -s http://localhost:3000/api/health 2>&1 || wget -qO- http://localhost:3000/api/health 2>&1"')
print(f"  Health: {out}")

pve.close()
print("\n=== Done ===")
