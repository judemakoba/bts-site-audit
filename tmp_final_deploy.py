#!/usr/bin/env python3
"""Deploy BTS repo to LXC 203 via tar + pct push"""
import paramiko, io, os, time

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

# Step 1: Push tar to LXC 203
print("[1] Push tar to LXC 203...")
local_tar = r'D:\Mop_Projects\Asset_Verification\bts-repo.tar'
sftp = pve.open_sftp()

# First push to PVE host
print("  Pushing to PVE host /tmp/...")
sftp.put(local_tar, '/tmp/bts-repo.tar')
stat = sftp.stat('/tmp/bts-repo.tar')
print(f"  On PVE: {stat.st_size:,} bytes")

# Then pct push to LXC 203
print("  Pushing to LXC 203...")
out, err = run(pve, 'pct push 203 /tmp/bts-repo.tar /tmp/bts-repo.tar 2>&1')
print(f"  pct push: {out} | {err}")

# Verify
out, err = run(pve, 'pct exec 203 -- bash -c "ls -lh /tmp/bts-repo.tar"')
print(f"  In LXC 203: {out}")

# Step 2: Clean old dir and extract
print("[2] Extract in LXC 203...")
out, err = run(pve, 'pct exec 203 -- bash -c "rm -rf /root/bts-site-audit && cd /root && tar -xf /tmp/bts-repo.tar && ls"')
print(f"  Extract: {out}")

out, err = run(pve, 'pct exec 203 -- bash -c "ls /root/bts-site-audit/"')
print(f"  Files: {out}")

out, err = run(pve, 'pct exec 203 -- bash -c "ls /root/bts-site-audit/backend/"')
print(f"  Backend: {out}")

# Step 3: Setup dirs and env
print("[3] Setup...")
run(pve, 'pct exec 203 -- bash -c "mkdir -p /root/bts-site-audit/data/uploads"')
run(pve, 'pct exec 203 -- bash -c "ln -sf /usr/local/node-v20.18.0-linux-x64/bin/node /usr/local/bin/node"')
run(pve, 'pct exec 203 -- bash -c "ln -sf /usr/local/node-v20.18.0-linux-x64/bin/npm /usr/local/bin/npm"')

# Check env
out, err = run(pve, 'pct exec 203 -- bash -c "cat /root/bts-site-audit/.env"')
print(f"  Env: {out}")

# Step 4: npm install
print("[4] npm install (2-3 min)...")
stdin, stdout, stderr = pve.exec_command(
    'pct exec 203 -- bash -c "cd /root/bts-site-audit/backend && npm install --ignore-scripts 2>&1"',
    timeout=180
)
out = stdout.read().decode()
err = stderr.read().decode()
print(f"  stdout tail: {out.strip()[-500:]}")
if err.strip():
    print(f"  stderr: {err.strip()[-200:]}")

# Step 5: Start server
print("[5] Start server...")
run(pve, 'pct exec 203 -- bash -c "cd /root/bts-site-audit/backend && nohup /usr/local/bin/node server.js > /tmp/bts.log 2>&1 &"')
time.sleep(6)

# Step 6: Health check
print("[6] Health check...")
out, err = run(pve, 'pct exec 203 -- bash -c "cat /tmp/bts.log | tail -20"')
print(f"  Log: {out}")
out, err = run(pve, 'pct exec 203 -- bash -c "curl -s http://localhost:3000/api/health 2>&1"')
print(f"  Health: {out}")
out, err = run(pve, 'pct exec 203 -- bash -c "ps aux --no-headers | grep node | grep -v grep"')
print(f"  Processes: {out}")

sftp.close()
pve.close()
print("\n=== Deployment Complete ===")
