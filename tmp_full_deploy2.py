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

pve = ssh_pve()

# Check where node is
out, err = run(pve, 'pct exec 203 -- bash -c "ls /usr/local/node-v20.18.0-linux-x64/bin/"')
print('Node bin dir:', out)

# Create symlinks so node is in PATH
out, err = run(pve, 'pct exec 203 -- bash -c "ln -sf /usr/local/node-v20.18.0-linux-x64/bin/node /usr/local/bin/node && ln -sf /usr/local/node-v20.18.0-linux-x64/bin/npm /usr/local/bin/npm && ln -sf /usr/local/node-v20.18.0-linux-x64/bin/npx /usr/local/bin/npx && echo SYMLINKS_OK"')
print('Symlinks:', out)

# Verify
out, err = run(pve, 'pct exec 203 -- bash -c "node --version && npm --version"')
print('Node/npm:', out)

# Clone repo
print('Cloning repo...')
run(pve, 'pct exec 203 -- bash -c "cd /root && rm -rf bts-site-audit 2>/dev/null; git clone https://github.com/judemakoba/bts-site-audit.git 2>&1 | tail -3"')
out, err = run(pve, 'pct exec 203 -- bash -c "ls /root/bts-site-audit/backend/ | head -5"')
print('Repo files:', out)

# Setup
run(pve, 'pct exec 203 -- bash -c "cd /root/bts-site-audit && mkdir -p data/uploads"')
cmds = [
    'JWT_SECRET=ecd5daab14b43fc0387817a8b0241ec49ef0aa5f9da72e9f93896e3f048d3764',
    'JWT_EXPIRY=7d',
    'NODE_ENV=production',
    'PORT=3000',
    'ALLOWED_ORIGINS=*',
]
for c in cmds:
    run(pve, f'pct exec 203 -- bash -c "cd /root/bts-site-audit && echo {c} >> .env"')
out, err = run(pve, 'pct exec 203 -- bash -c "cat /root/bts-site-audit/.env"')
print('Env:', out)

# npm install
print('npm install...')
stdin, stdout, stderr = pve.exec_command('pct exec 203 -- bash -c "cd /root/bts-site-audit/backend && npm install --ignore-scripts 2>&1"')
out = stdout.read().decode()
err = stderr.read().decode()
print('npm tail:', out.strip()[-300:])
if err.strip():
    print('npm err:', err.strip()[-200:])

# Start server
print('Starting server...')
run(pve, 'pct exec 203 -- bash -c "cd /root/bts-site-audit/backend && nohup node server.js > /tmp/bts.log 2>&1 &"')
time.sleep(5)

out, err = run(pve, 'pct exec 203 -- bash -c "cat /tmp/bts.log | tail -15"')
print('Server log:', out)

out, err = run(pve, 'pct exec 203 -- bash -c "curl -s http://localhost:3000/api/health 2>&1"')
print('Health:', out)

out, err = run(pve, 'pct exec 203 -- bash -c "ps aux --no-headers | grep node | grep -v grep"')
print('Node process:', out)

pve.close()
print('Done!')
