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
print("[1] Downloading repo zip...")
out, err = run(pve, 'pct exec 203 -- bash -c "cd /root && wget -q -O bts.zip https://github.com/judemakoba/bts-site-audit/archive/refs/heads/main.zip && echo ZIP_OK && ls -lh bts.zip", timeout=60)
print(f"  {out} | {err}")

print("[2] Extracting zip...")
out, err = run(pve, 'pct exec 203 -- bash -c "cd /root && unzip -q bts.zip && mv bts-site-audit-main bts-site-audit && rm bts.zip && echo UNZIP_OK && ls bts-site-audit/"')
print(f"  {out} | {err}")

print("[3] Setup dirs...")
run(pve, 'pct exec 203 -- bash -c "mkdir -p /root/bts-site-audit/data/uploads"')
for var in ["JWT_SECRET=ecd5daab14b43fc0387817a8b0241ec49ef0aa5f9da72e9f93896e3f048d3764", "JWT_EXPIRY=7d", "NODE_ENV=production", "PORT=3000", "ALLOWED_ORIGINS=*"]:
    run(pve, f'pct exec 203 -- bash -c "cd /root/bts-site-audit && echo {var} >> .env"')

print("[4] npm install (2-3 min)...")
stdin, stdout, stderr = pve.exec_command('pct exec 203 -- bash -c "cd /root/bts-site-audit/backend && npm install --ignore-scripts 2>&1"', timeout=180)
out = stdout.read().decode()
err = stderr.read().decode()
print('  stdout tail:', out.strip()[-300:])
if err.strip():
    print('  stderr:', err.strip()[-200:])

print("[5] Start server...")
run(pve, 'pct exec 203 -- bash -c "cd /root/bts-site-audit/backend && nohup /usr/local/bin/node server.js > /tmp/bts.log 2>&1 &"')
time.sleep(5)

print("[6] Check server...")
out, err = run(pve, 'pct exec 203 -- bash -c "cat /tmp/bts.log | tail -15"')
print('  Log:', out)
out, err = run(pve, 'pct exec 203 -- bash -c "curl -s http://localhost:3000/api/health"')
print('  Health:', out)
out, err = run(pve, 'pct exec 203 -- bash -c "ps aux --no-headers | grep node | grep -v grep"')
print('  Node process:', out)

pve.close()
print("\n=== Done! ===")
