#!/usr/bin/env python3
"""Extract zip via Python zipfile, then upload via SFTP"""
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

# 1. Download zip from PVE to local
print("[1] Downloading zip from LXC 203...")
local_zip = r'D:\Mop_Projects\Asset_Verification\bts-repo.zip'
remote_zip = '/root/bts.zip'
sftp.get(remote_zip, local_zip)
print(f"  Downloaded: {os.path.getsize(local_zip):,} bytes")

# 2. Extract using Python zipfile
print("[2] Extracting locally...")
import zipfile
extract_dir = r'D:\Mop_Projects\Asset_Verification\bts-site-audit'
with zipfile.ZipFile(local_zip, 'r') as z:
    z.extractall(extract_dir)
    names = z.namelist()
print(f"  Files: {len(names)}, first 5: {names[:5]}")

# Find the extracted repo directory
repo_dirs = [n for n in names if '/' in n and n.split('/')[0] == 'bts-site-audit-main']
print(f"  Repo dirs: {set(n.split('/')[1] for n in repo_dirs if len(n.split('/')) > 1)}")

# 3. Upload extracted files via SFTP
print("[3] Uploading files to LXC 203...")
src_root = os.path.join(extract_dir, 'bts-site-audit-main')
count = 0
for root, dirs, files in os.walk(src_root):
    rel = os.path.relpath(root, src_root)
    if rel == '.':
        rel = ''
    for fname in files:
        local_path = os.path.join(root, fname)
        remote_dir = f'/root/bts-site-audit/{rel}' if rel else '/root/bts-site-audit'
        remote_path = f'{remote_dir}/{fname}'
        sftp.put(local_path, remote_path)
        count += 1
        if count % 50 == 0:
            print(f"  Uploaded {count} files...")

print(f"  Uploaded {count} files total")

# 4. Verify
print("[4] Verifying...")
out, err = run(pve, 'pct exec 203 -- bash -c "ls /root/bts-site-audit/"')
print(f"  Files: {out}")

# 5. Setup env and dirs
print("[5] Setup...")
cmds = [
    'mkdir -p /root/bts-site-audit/data/uploads',
    'ln -sf /usr/local/node-v20.18.0-linux-x64/bin/node /usr/local/bin/node',
    'ln -sf /usr/local/node-v20.18.0-linux-x64/bin/npm /usr/local/bin/npm',
]
for c in cmds:
    run(pve, f'pct exec 203 -- bash -c "{c}"')

# Create .env
env_content = 'JWT_SECRET=ecd5daab14b43fc0387817a8b0241ec49ef0aa5f9da72e9f93896e3f048d3764\nJWT_EXPIRY=7d\nNODE_ENV=production\nPORT=3000\nALLOWED_ORIGINS=*\n'
f = io.BytesIO(env_content.encode())
sftp.putfo(f, '/root/bts-site-audit/.env')
print("  .env created")

out, err = run(pve, 'pct exec 203 -- bash -c "cat /root/bts-site-audit/.env"')
print(f"  Env: {out}")

# 6. npm install
print("[6] npm install (2-3 min)...")
stdin, stdout, stderr = pve.exec_command('pct exec 203 -- bash -c "cd /root/bts-site-audit/backend && npm install --ignore-scripts 2>&1"', timeout=180)
out = stdout.read().decode()
err = stderr.read().decode()
print(f"  tail: {out.strip()[-400:]}")
if err.strip():
    print(f"  err: {err.strip()[-200:]}")

# 7. Start server
print("[7] Start server...")
run(pve, 'pct exec 203 -- bash -c "cd /root/bts-site-audit/backend && nohup /usr/local/bin/node server.js > /tmp/bts.log 2>&1 &"')
time.sleep(6)

# 8. Check
print("[8] Check...")
out, err = run(pve, 'pct exec 203 -- bash -c "cat /tmp/bts.log | tail -15"')
print(f"  Log: {out}")
out, err = run(pve, 'pct exec 203 -- bash -c "curl -s http://localhost:3000/api/health 2>&1"')
print(f"  Health: {out}")

sftp.close()
pve.close()
print("\n=== Done ===")
