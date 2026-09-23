#!/usr/bin/env python3
import paramiko

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

# Check what happened with the zip
out, err = run(pve, 'pct exec 203 -- bash -c "ls -la /root/"')
print('Root:', out)
out, err = run(pve, 'pct exec 203 -- bash -c "ls /root/bts-site-audit-main/ 2>/dev/null || echo NOT_FOUND"')
print('bts-site-audit-main:', out)
out, err = run(pve, 'pct exec 203 -- bash -c "find /root -maxdepth 2 -type f -name server.js 2>/dev/null"')
print('server.js:', out)
out, err = run(pve, 'pct exec 203 -- bash -c "find /root -maxdepth 3 -type d -name backend 2>/dev/null"')
print('backend dir:', out)

# Try again - download fresh
print('\nFresh download...')
out, err = run(pve, 'pct exec 203 -- bash -c "cd /root && rm -rf bts-site-audit bts-site-audit-main bts.zip 2>/dev/null; wget -q -O bts.zip https://github.com/judemakoba/bts-site-audit/archive/refs/heads/main.zip && echo downloaded && ls -lh bts.zip"', timeout=120)
print('Download:', out, err)

out, err = run(pve, 'pct exec 203 -- bash -c "cd /root && unzip -q bts.zip && ls"')
print('After unzip:', out)
out, err = run(pve, 'pct exec 203 -- bash -c "ls /root/bts-site-audit-main/"')
print('Repo contents:', out)

# Move and setup
run(pve, 'pct exec 203 -- bash -c "cd /root && mv bts-site-audit-main bts-site-audit && rm bts.zip"')
out, err = run(pve, 'pct exec 203 -- bash -c "ls /root/bts-site-audit/"')
print('After move:', out)

# Create symlinks (they may have been lost)
out, err = run(pve, 'pct exec 203 -- bash -c "ln -sf /usr/local/node-v20.18.0-linux-x64/bin/node /usr/local/bin/node && ln -sf /usr/local/node-v20.18.0-linux-x64/bin/npm /usr/local/bin/npm && /usr/local/bin/node --version"')
print('Node version:', out)

# Setup env
cmds = [
    'JWT_SECRET=ecd5daab14b43fc0387817a8b0241ec49ef0aa5f9da72e9f93896e3f048d3764',
    'JWT_EXPIRY=7d',
    'NODE_ENV=production',
    'PORT=3000',
    'ALLOWED_ORIGINS=*',
]
for c in cmds:
    run(pve, f'pct exec 203 -- bash -c "echo {c} >> /root/bts-site-audit/.env"')
run(pve, 'pct exec 203 -- bash -c "mkdir -p /root/bts-site-audit/data/uploads"')
out, err = run(pve, 'pct exec 203 -- bash -c "cat /root/bts-site-audit/.env"')
print('Env:', out)

pve.close()
