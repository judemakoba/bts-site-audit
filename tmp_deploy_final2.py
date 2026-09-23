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
print("[1] wget test...")
out, err = run(pve, 'pct exec 203 -- bash -c "wget --version | head -1"')
print(f"  wget: {out}")

print("[2] Download zip...")
out, err = run(pve, 'pct exec 203 -- bash -c "cd /root && wget -O bts.zip https://github.com/judemakoba/bts-site-audit/archive/refs/heads/main.zip 2>&1 | tail -5"', timeout=120)
print(f"  {out}")
out, err = run(pve, 'pct exec 203 -- bash -c "ls -lh /root/bts.zip 2>&1"')
print(f"  zip: {out}")

print("[3] Extract...")
out, err = run(pve, 'pct exec 203 -- bash -c "cd /root && unzip -q bts.zip && ls"')
print(f"  {out}")
out, err = run(pve, 'pct exec 203 -- bash -c "cd /root && mv bts-site-audit-main bts-site-audit && rm bts.zip && ls bts-site-audit/"')
print(f"  {out}")

print("[4] npm install...")
stdin, stdout, stderr = pve.exec_command('pct exec 203 -- bash -c "cd /root/bts-site-audit/backend && npm install --ignore-scripts 2>&1 | tail -10"', timeout=180)
out = stdout.read().decode()
print(f"  {out[-400:]}")

print("[5] Setup env...")
cmds = [
    'JWT_SECRET=ecd5daab14b43fc0387817a8b0241ec49ef0aa5f9da72e9f93896e3f048d3764',
    'JWT_EXPIRY=7d',
    'NODE_ENV=production',
    'PORT=3000',
    'ALLOWED_ORIGINS=*',
]
for c in cmds:
    run(pve, f'pct exec 203 -- bash -c "cd /root/bts-site-audit && echo {c} >> .env"')
out, err = run(pve, 'pct exec 203 -- bash -c "mkdir -p /root/bts-site-audit/data/uploads && cat /root/bts-site-audit/.env"')
print(f"  {out}")

print("[6] Start server...")
run(pve, 'pct exec 203 -- bash -c "cd /root/bts-site-audit/backend && nohup /usr/local/bin/node server.js > /tmp/bts.log 2>&1 &"')
time.sleep(6)
out, err = run(pve, 'pct exec 203 -- bash -c "cat /tmp/bts.log | tail -10"')
print(f"  {out}")
out, err = run(pve, 'pct exec 203 -- bash -c "curl -s http://localhost:3000/api/health"')
print(f"  Health: {out}")

pve.close()
