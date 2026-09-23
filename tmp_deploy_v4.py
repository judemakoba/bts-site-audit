#!/usr/bin/env python3
"""Deploy BTS Audit API to LXC 203 via SFTP chain"""
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
sftp = pve.open_sftp()

# Step 1: Pull zip from LXC 203 to PVE host
print("[1] Pull zip from LXC 203 to PVE host...")
out, err = run(pve, 'pct pull 203 /root/bts.zip /tmp/bts.zip 2>&1')
print(f"  pull result: {out} | {err}")
out, err = run(pve, 'ls -lh /tmp/bts.zip')
print(f"  PVE zip: {out}")

# Step 2: Download zip from PVE to Windows
print("[2] Download zip to Windows...")
local_zip = r'D:\Mop_Projects\Asset_Verification\bts-repo.zip'
sftp.get('/tmp/bts.zip', local_zip)
sz = os.path.getsize(local_zip)
print(f"  Downloaded: {sz:,} bytes")

# Step 3: Extract locally
print("[3] Extract...")
import zipfile
extract_dir = r'D:\Mop_Projects\Asset_Verification\bts-site-audit'
with zipfile.ZipFile(local_zip, 'r') as z:
    names = z.namelist()
    z.extractall(extract_dir)
print(f"  {len(names)} files extracted. First 3: {names[:3]}")

# Step 4: Upload to LXC 203 via SFTP (push to container)
src_root = os.path.join(extract_dir, 'bts-site-audit-main')
count = 0
print("[4] Upload to LXC 203...")
for root, dirs, files in os.walk(src_root):
    rel = os.path.relpath(root, src_root)
    if rel == '.': rel = ''
    for fname in files:
        local_path = os.path.join(root, fname)
        if rel:
            remote_path = f'/root/bts-site-audit/{rel}/{fname}'
        else:
            remote_path = f'/root/bts-site-audit/{fname}'
        try:
            sftp.put(local_path, remote_path)
            count += 1
        except Exception as e:
            print(f"  Error uploading {fname}: {e}")
        if count % 100 == 0:
            print(f"  {count} files...")
print(f"  Uploaded {count} files")

# Step 5: Setup
print("[5] Setup...")
run(pve, 'pct exec 203 -- bash -c "mkdir -p /root/bts-site-audit/data/uploads"')
run(pve, 'pct exec 203 -- bash -c "ln -sf /usr/local/node-v20.18.0-linux-x64/bin/node /usr/local/bin/node"')
run(pve, 'pct exec 203 -- bash -c "ln -sf /usr/local/node-v20.18.0-linux-x64/bin/npm /usr/local/bin/npm"')

env_content = 'JWT_SECRET=ecd5daab14b43fc0387817a8b0241ec49ef0aa5f9da72e9f93896e3f048d3764\nJWT_EXPIRY=7d\nNODE_ENV=production\nPORT=3000\nALLOWED_ORIGINS=*\n'
f = io.BytesIO(env_content.encode())
sftp.putfo(f, '/root/bts-site-audit/.env')

out, err = run(pve, 'pct exec 203 -- bash -c "ls /root/bts-site-audit/"')
print(f"  LXC files: {out}")

# Step 6: npm install
print("[6] npm install (~2 min)...")
stdin, stdout, stderr = pve.exec_command('pct exec 203 -- bash -c "cd /root/bts-site-audit/backend && npm install --ignore-scripts 2>&1"', timeout=180)
out = stdout.read().decode()
err = stderr.read().decode()
print(f"  tail: {out.strip()[-500:]}")
if err.strip():
    print(f"  err: {err.strip()[-200:]}")

# Step 7: Start server
print("[7] Start server...")
run(pve, 'pct exec 203 -- bash -c "cd /root/bts-site-audit/backend && nohup /usr/local/bin/node server.js > /tmp/bts.log 2>&1 &"')
time.sleep(6)

# Step 8: Health check
print("[8] Health check...")
out, err = run(pve, 'pct exec 203 -- bash -c "cat /tmp/bts.log | tail -20"')
print(f"  Log: {out}")
out, err = run(pve, 'pct exec 203 -- bash -c "curl -s http://localhost:3000/api/health 2>&1"')
print(f"  Health: {out}")
out, err = run(pve, 'pct exec 203 -- bash -c "ps aux --no-headers | grep node | grep -v grep"')
print(f"  Node: {out}")

sftp.close()
pve.close()
print("\n=== Complete ===")
