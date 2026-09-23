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

def run(pve, cmd):
    stdin, stdout, stderr = pve.exec_command(cmd)
    return stdout.read().decode().strip(), stderr.read().decode().strip()

print("[1] Connecting...")
pve = ssh_pve()

print("[2] Extracting Node.js...")
out, err = run(pve, 'pct exec 203 -- bash -c "cd /usr/local && tar -xJf /tmp/node.tar.xz && rm /tmp/node.tar.xz && echo EXTRACT_OK"')
print(f"  Result: {out} | {err}")

print("[3] Verify Node.js...")
out, err = run(pve, 'pct exec 203 -- bash -c "export PATH=/usr/local/bin:$PATH && node --version && npm --version"')
print(f"  {out} | {err}")

print("[4] Clone repo...")
run(pve, 'pct exec 203 -- bash -c "cd /root && rm -rf bts-site-audit"')
out, err = run(pve, 'pct exec 203 -- bash -c "cd /root && git clone https://github.com/judemakoba/bts-site-audit.git 2>&1 | tail -3"')
print(f"  {out} | {err}")

print("[5] Setup dirs and env...")
run(pve, 'pct exec 203 -- bash -c "cd /root/bts-site-audit && mkdir -p data/uploads"')
run(pve, 'pct exec 203 -- bash -c "cd /root/bts-site-audit && echo JWT_SECRET=ecd5daab14b43fc0387817a8b0241ec49ef0aa5f9da72e9f93896e3f048d3764 > .env"')
for var in ["JWT_EXPIRY=7d", "NODE_ENV=production", "PORT=3000", "ALLOWED_ORIGINS=*"]:
    run(pve, f'pct exec 203 -- bash -c "cd /root/bts-site-audit && echo {var} >> .env"')
out, err = run(pve, 'pct exec 203 -- bash -c "cat /root/bts-site-audit/.env"')
print(f"  Env: {out}")

print("[6] npm install (this takes ~1-2 min)...")
stdin, stdout, stderr = pve.exec_command('pct exec 203 -- bash -c "cd /root/bts-site-audit/backend && npm install --ignore-scripts 2>&1"')
output = stdout.read().decode()
errout = stderr.read().decode()
print(f"  stdout tail: {output.strip()[-300:]}")
if errout.strip():
    print(f"  stderr tail: {errout.strip()[-200:]}")

print("[7] Start server...")
run(pve, 'pct exec 203 -- bash -c "cd /root/bts-site-audit/backend && nohup node server.js > /tmp/bts.log 2>&1 &"')
time.sleep(5)

print("[8] Server log...")
out, err = run(pve, 'pct exec 203 -- bash -c "cat /tmp/bts.log | tail -15"')
print(f"  {out}")

print("[9] Health check...")
out, err = run(pve, 'pct exec 203 -- bash -c "curl -s http://localhost:3000/api/health 2>&1 || echo NOT_READY_YET"')
print(f"  Health: {out}")

pve.close()
print("\n=== Done ===")
