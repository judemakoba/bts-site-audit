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

# Debug: what does npm script look like?
print("[1] Check npm script...")
out, err = run(pve, 'pct exec 203 -- bash -c "head -5 /usr/local/bin/npm 2>&1 || ls -la /usr/local/bin/npm"')
print(f"  {out}")

# Try running npm directly (not via env)
print("[2] Test npm directly...")
out, err = run(pve, 'pct exec 203 -- bash -c "node /usr/local/node-v20.18.0-linux-x64/bin/npm --version 2>&1"')
print(f"  {out}")

# Try with full PATH
print("[3] npm with explicit PATH...")
out, err = run(pve, 'pct exec 203 -- bash -c "export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH; npm --version 2>&1"')
print(f"  {out}")

# Check /usr/bin/env node
print("[4] /usr/bin/env node test...")
out, err = run(pve, 'pct exec 203 -- bash -c "export PATH=/usr/local/bin:/usr/bin:/bin; which node; /usr/bin/env node --version 2>&1"')
print(f"  {out}")

# Try installing packages directly using node
print("[5] Install dotenv manually...")
# Download dotenv package
stdin, stdout, stderr = pve.exec_command(
    'pct exec 203 -- bash -c "cd /root/bts-site-audit/backend && mkdir -p node_modules/dotenv && node -e \\"const https=require(\\\"https\\\"); const fs=require(\\\"fs\\\"); https.get(\\\"https://registry.npmjs.org/dotenv/-/dotenv-16.4.5.tgz\\\", r=>{let d=[]; r.on(\\\"data\\\",c=>d.push(c)); r.on(\\\"end\\\",()=>{fs.writeFileSync(\\\"dotenv.tgz\\\",Buffer.concat(d));require(\\\"child_process\\\").execSync(\\\"tar -xzf dotenv.tgz && mv package node_modules/dotenv && rm dotenv.tgz\\\");console.log(\\\"dotenv installed\\\");})});\\" 2>&1"',
    timeout=60
)
out = stdout.read().decode()
err = stderr.read().decode()
print(f"  {out} {err}")

# Actually, let's just install ALL packages at once using node's require to fetch and install
# Better approach: use npm with the full path to node
print("[6] npm install using explicit node path...")
stdin, stdout, stderr = pve.exec_command(
    'pct exec 203 -- bash -c "cd /root/bts-site-audit/backend && NODE_PATH=/usr/local/node-v20.18.0-linux-x64/lib/node_modules /usr/local/node-v20.18.0-linux-x64/bin/npm install --ignore-scripts 2>&1 | tail -20"',
    timeout=180
)
out = stdout.read().decode()
err = stderr.read().decode()
print(f"  {out[-400:]}")
if err.strip():
    print(f"  err: {err[-200:]}")

# Restart server
print("[7] Restart server...")
run(pve, 'pct exec 203 -- bash -c "pkill -f node 2>/dev/null; sleep 1"')
run(pve, 'pct exec 203 -- bash -c "cd /root/bts-site-audit/backend && nohup /usr/local/bin/node server.js > /tmp/bts.log 2>&1 &"')
time.sleep(6)

print("[8] Health check...")
out, err = run(pve, 'pct exec 203 -- bash -c "cat /tmp/bts.log | tail -15"')
print(f"  {out}")
out, err = run(pve, 'pct exec 203 -- bash -c "ps aux --no-headers | grep node | grep -v grep"')
print(f"  Node: {out}")

pve.close()
