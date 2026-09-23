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

# Create directory structure on LXC 203
print("[1] Create dirs...")
run(pve, 'pct exec 203 -- bash -c "rm -rf /root/bts-site-audit && mkdir -p /root/bts-site-audit/data/uploads"')
print("  Dirs created")

# Check what's in the local extracted zip
src_root = r'D:\Mop_Projects\Asset_Verification\bts-site-audit\bts-site-audit-main'
print(f"[2] Local repo: {os.listdir(src_root)}")

# Upload files via SFTP using pct exec's stdin pipe
print("[3] Upload files via SFTP...")
count = 0
errors = 0
for root, dirs, files in os.walk(src_root):
    rel = os.path.relpath(root, src_root)
    if rel == '.': rel = ''
    for fname in files:
        local_path = os.path.join(root, fname)
        if rel:
            remote_dir = f'/root/bts-site-audit/{rel}'
        else:
            remote_dir = '/root/bts-site-audit'

        # Create remote dir if needed
        try:
            sftp.stat(remote_dir)
        except:
            # Directory doesn't exist, create it
            parts = remote_dir.split('/')
            for i in range(2, len(parts)+1):
                d = '/'.join(parts[:i])
                try:
                    sftp.mkdir(d)
                except:
                    pass

        remote_path = f'{remote_dir}/{fname}'
        try:
            sftp.put(local_path, remote_path)
            count += 1
        except Exception as e:
            errors += 1
            if errors <= 3:
                print(f"  Error: {e}")

print(f"  Uploaded: {count}, Errors: {errors}")

# Verify
print("[4] Verify...")
out, err = run(pve, 'pct exec 203 -- bash -c "ls /root/bts-site-audit/"')
print(f"  Root: {out}")
out, err = run(pve, 'pct exec 203 -- bash -c "ls /root/bts-site-audit/backend/ 2>/dev/null || echo NO_BACKEND_DIR"')
print(f"  Backend: {out}")

# Setup symlinks
print("[5] Setup...")
run(pve, 'pct exec 203 -- bash -c "ln -sf /usr/local/node-v20.18.0-linux-x64/bin/node /usr/local/bin/node"')
run(pve, 'pct exec 203 -- bash -c "ln -sf /usr/local/node-v20.18.0-linux-x64/bin/npm /usr/local/bin/npm"')

# Create .env via SFTP
env_content = 'JWT_SECRET=ecd5daab14b43fc0387817a8b0241ec49ef0aa5f9da72e9f93896e3f048d3764\nJWT_EXPIRY=7d\nNODE_ENV=production\nPORT=3000\nALLOWED_ORIGINS=*\n'
f = io.BytesIO(env_content.encode())
sftp.putfo(f, '/root/bts-site-audit/.env')

out, err = run(pve, 'pct exec 203 -- bash -c "cat /root/bts-site-audit/.env"')
print(f"  Env: {out}")

# npm install
print("[6] npm install (2-3 min)...")
stdin, stdout, stderr = pve.exec_command('pct exec 203 -- bash -c "cd /root/bts-site-audit/backend && npm install --ignore-scripts 2>&1"', timeout=180)
out = stdout.read().decode()
err = stderr.read().decode()
print(f"  stdout tail: {out.strip()[-500:]}")
if err.strip():
    print(f"  stderr: {err.strip()[-200:]}")

# Start server
print("[7] Start server...")
run(pve, 'pct exec 203 -- bash -c "cd /root/bts-site-audit/backend && nohup /usr/local/bin/node server.js > /tmp/bts.log 2>&1 &"')
time.sleep(6)

# Health check
print("[8] Health check...")
out, err = run(pve, 'pct exec 203 -- bash -c "cat /tmp/bts.log | tail -15"')
print(f"  Log: {out}")
out, err = run(pve, 'pct exec 203 -- bash -c "curl -s http://localhost:3000/api/health 2>&1"')
print(f"  Health: {out}")
out, err = run(pve, 'pct exec 203 -- bash -c "ps aux --no-headers | grep node | grep -v grep"')
print(f"  Node: {out}")

sftp.close()
pve.close()
print("\n=== Done ===")
