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

# Kill old processes
print("[1] Cleanup...")
run(pve, 'pct exec 203 -- bash -c "pkill -f node 2>/dev/null; sleep 1"')

# Start server with correct PATH
print("[2] Start server...")
run(pve, 'pct exec 203 -- bash -c "export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin && cd /root/bts-site-audit/backend && nohup node server.js > /tmp/bts.log 2>&1 &"')
time.sleep(6)

print("[3] Server status...")
out, err = run(pve, 'pct exec 203 -- bash -c "cat /tmp/bts.log | tail -20"')
print(f"  Log: {out}")
out, err = run(pve, 'pct exec 203 -- bash -c "ps aux --no-headers | grep node | grep -v grep"')
print(f"  Node: {out}")
out, err = run(pve, 'pct exec 203 -- bash -c "wget -qO- http://localhost:3000/api/health 2>&1"')
print(f"  Health (wget): {out}")

# Try login
print("[4] Test login...")
out, err = run(pve, 'pct exec 203 -- bash -c "wget -qO- --post-data=\\'email=admin@bts-audit.com&password=admin123\\' --header=\\'Content-Type: application/json\\' http://localhost:3000/api/auth/login 2>&1"')
print(f"  Login: {out}")

pve.close()
print("\n=== Done ===")
