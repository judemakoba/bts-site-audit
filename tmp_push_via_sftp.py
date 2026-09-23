#!/usr/bin/env python3
"""
Push Node.js binary to LXC 203 via SFTP chain:
Windows -> PVE host (192.168.1.68) -> LXC 203 (pct push)
"""
import paramiko
import os
import sys

NODE_FILE = r'D:\Mop_Projects\Asset_Verification\node-v20.18.0-linux-x64.tar.xz'
NODE_SIZE = os.path.getsize(NODE_FILE)
print(f"File size: {NODE_SIZE:,} bytes ({NODE_SIZE/1e6:.1f} MB)")

# Step 1: Connect to PVE host via pve-mgmt jumpbox
print("\n[1] Connecting to PVE host (192.168.1.68) via jumpbox...")
jumpbox = paramiko.SSHClient()
jumpbox.set_missing_host_key_policy(paramiko.AutoAddPolicy())
jumpbox.connect('100.93.195.102', username='root', look_for_keys=True, timeout=10)

# Transport via jumpbox to PVE host
jumpbox_transport = jumpbox.get_transport()
dest_addr = ('192.168.1.68', 22)
local_addr = ('192.168.1.9', 0)
channel = jumpbox_transport.open_channel('direct-tcpip', dest_addr, local_addr)

pve = paramiko.SSHClient()
pve.set_missing_host_key_policy(paramiko.AutoAddPolicy())
pve.connect('192.168.1.68', username='root', look_for_keys=True, sock=channel, timeout=10)
print("Connected!")

# Step 2: SFTP to PVE host
print("\n[2] Starting SFTP to PVE host...")
sftp = pve.open_sftp()
sftp.get_channel().settimeout(60)

# Upload file to /tmp on PVE host
remote_path = '/tmp/node-v20.18.0-linux-x64.tar.xz'
print(f"[3] Uploading {NODE_SIZE/1e6:.1f} MB to {remote_path}...")
with open(NODE_FILE, 'rb') as f:
    sftp.putfo(f, remote_path, callback=lambda c, t: print(f"\r  {c:,}/{NODE_SIZE:,} bytes", end='', flush=True))
print(f"\nUpload done!")

# Verify
stat = sftp.stat(remote_path)
print(f"Remote size: {stat.st_size:,} bytes")

# Step 3: Push to LXC 203 via pct
print("\n[4] Pushing to LXC 203...")
stdin, stdout, stderr = pve.exec_command('pct push 203 /tmp/node-v20.18.0-linux-x64.tar.xz /tmp/node.tar.xz')
result = stdout.read().decode()
err = stderr.read().decode()
print(f"stdout: {result}")
if err:
    print(f"stderr: {err}")

# Step 4: Extract in LXC 203
print("\n[5] Extract in LXC 203...")
cmds = [
    ("Extract tar", "cd /usr/local && tar -xJf /tmp/node.tar.xz && rm /tmp/node.tar.xz"),
    ("Verify", "ls /usr/local/bin/node /usr/local/bin/npm"),
    ("Version check", "export PATH=/usr/local/bin:$PATH && node --version"),
]
for name, cmd in cmds:
    stdin, stdout, stderr = pve.exec_command(f'pct exec 203 -- bash -c "{cmd}"')
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    print(f"  {name}: {out or err}")

# Step 5: Clone and deploy
print("\n[6] Clone repo...")
pve.exec_command('pct exec 203 -- bash -c "cd /root && git clone https://github.com/judemakoba/bts-site-audit.git"')[1].read()

print("\n[7] Install deps...")
stdin, stdout, stderr = pve.exec_command('pct exec 203 -- bash -c "cd /root/bts-site-audit/backend && npm install --ignore-scripts 2>&1 | tail -3"')
print("  " + stdout.read().decode().strip())

print("\n[8] Setup env + start...")
env_setup = 'cd /root/bts-site-audit && mkdir -p data/uploads && echo JWT_SECRET=ecd5daab14b43fc0387817a8b0241ec49ef0aa5f9da72e9f93896e3f048d3764 > .env && echo JWT_EXPIRY=7d >> .env && echo NODE_ENV=production >> .env && echo PORT=3000 >> .env && echo ALLOWED_ORIGINS=* >> .env'
pve.exec_command(f'pct exec 203 -- bash -c "{env_setup}"')[1].read()

start = 'cd /root/bts-site-audit/backend && nohup node server.js > /tmp/bts.log 2>&1 &'
pve.exec_command(f'pct exec 203 -- bash -c "{start}"')[1].read()

import time; time.sleep(5)

stdin, stdout, stderr = pve.exec_command('pct exec 203 -- bash -c "curl -s http://localhost:3000/api/health 2>&1"')
health = stdout.read().decode().strip()
print(f"\n[9] Health check: {health}")

sftp.close()
pve.close()
jumpbox.close()
print("\n=== Done! ===")
