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

# Check npm location
print("[1] Check npm...")
out, err = run(pve, 'pct exec 203 -- bash -c "ls -la /usr/local/bin/npm /usr/local/node-v20.18.0-linux-x64/bin/npm 2>&1"')
print(f"  npm bins: {out}")

# Create symlinks with full path
print("[2] Create npm symlink...")
out, err = run(pve, 'pct exec 203 -- bash -c "ln -sf /usr/local/node-v20.18.0-linux-x64/bin/node /usr/local/bin/node && ln -sf /usr/local/node-v20.18.0-linux-x64/bin/npm /usr/local/bin/npm && ln -sf /usr/local/node-v20.18.0-linux-x64/bin/npx /usr/local/bin/npx && ls -la /usr/local/bin/node /usr/local/bin/npm"')
print(f"  {out}")

# Test npm
print("[3] Test npm...")
out, err = run(pve, 'pct exec 203 -- bash -c "/usr/local/bin/npm --version 2>&1"')
print(f"  npm version: {out}")

# npm install
print("[4] npm install...")
stdin, stdout, stderr = pve.exec_command(
    'pct exec 203 -- bash -c "cd /root/bts-site-audit/backend && /usr/local/bin/npm install --ignore-scripts 2>&1"',
    timeout=180
)
out = stdout.read().decode()
err = stderr.read().decode()
print(f"  tail: {out.strip()[-600:]}")
if err.strip():
    print(f"  err: {err.strip()[-200:]}")

# Kill old node process
print("[5] Kill old server...")
run(pve, 'pct exec 203 -- bash -c "pkill -f node || true"')

# Start server with correct PATH
print("[6] Start server...")
run(pve, 'pct exec 203 -- bash -c "cd /root/bts-site-audit/backend && export PATH=/usr/local/bin:$PATH && nohup node server.js > /tmp/bts.log 2>&1 &"')
time.sleep(6)

# Health check
print("[7] Health check...")
out, err = run(pve, 'pct exec 203 -- bash -c "cat /tmp/bts.log | tail -15"')
print(f"  Log: {out}")
out, err = run(pve, 'pct exec 203 -- bash -c "ps aux --no-headers | grep node | grep -v grep"')
print(f"  Node: {out}")
out, err = run(pve, 'pct exec 203 -- bash -c "curl -s http://localhost:3000/api/health 2>&1"')
print(f"  Health: {out}")

pve.close()
print("\n=== Done ===")
